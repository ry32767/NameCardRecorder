import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AppHeader } from '../components/AppHeader'
import { Button } from '../components/Button'
import { CardForm } from '../components/CardForm'
import { ImagePicker } from '../components/ImagePicker'
import { SIDE_LABELS, otherSide } from '../lib/cardSide'
import { Notice } from '../components/Notice'
import { toOverlayLines } from '../lib/ocr/overlay'
import { copyText } from '../lib/clipboard'
import { ImageLoadError, prepareImage } from '../lib/ocr/image'
import { ENGINE_LABELS, createOcrProvider, engineFor, ocrInputBlob } from '../lib/ocr/engine'
import { parseOcrLines } from '../lib/ocr/parser'
import { createCard } from '../lib/github/createCard'
import { emptyCardFields } from '../lib/card/types'
import { hasErrors, todayIso, validateCard } from '../lib/card/validate'
import { useSettings } from '../store/settingsContext'
import type { OverlayLine } from '../lib/ocr/overlay'
import type { CardSide } from '../lib/cardSide'
import type { PreparedImage } from '../lib/ocr/image'
import type { Card, CardFields } from '../lib/card/types'
import type { CardFieldErrors } from '../lib/card/validate'
import type { OcrEngine } from '../lib/ocr/engine'
import type { OcrPhase, OcrProvider } from '../lib/ocr/types'

type SideMap<T> = Record<CardSide, T>

export const COPIED_MESSAGE = 'コピーしました'
export const COPY_FAILED_MESSAGE = 'コピーできませんでした。下の欄から手で選択してください'

/** コピーの知らせは読めれば十分なので、少し置いて自分で消える（spec 8.2） */
const COPIED_MESSAGE_MS = 2000

const NO_SIDES: SideMap<null> = { front: null, back: null }
const NO_OVERLAYS: SideMap<OverlayLine[]> = { front: [], back: [] }

export function NewCard({
  onCreated,
  ocrProvider,
}: {
  onCreated: (card: Card) => void
  /** テストや OCR の差し替え用。既定は設定で選んだエンジン（既定は PaddleOCR） */
  ocrProvider?: OcrProvider
}) {
  const navigate = useNavigate()
  const { settings, repoRef, save: saveSettings } = useSettings()

  const [fields, setFields] = useState<CardFields>(() => ({
    ...emptyCardFields(),
    metOn: todayIso(),
  }))
  const [errors, setErrors] = useState<CardFieldErrors>({})
  const [saving, setSaving] = useState(false)
  const [readingSide, setReadingSide] = useState<CardSide | null>(null)
  const [progress, setProgress] = useState(0)
  const [phase, setPhase] = useState<OcrPhase>('recognize')
  /** 読み取りに失敗した面。ここに軽い方のエンジンで読み直す入口を出す（spec 22） */
  const [fallbackSide, setFallbackSide] = useState<CardSide | null>(null)
  /** 認識テキストを画像に重ねるか。OFF にしても読み取り結果は捨てない（spec 9） */
  const [showOcrText, setShowOcrText] = useState(settings?.showOcrText ?? true)
  const [images, setImages] = useState<SideMap<PreparedImage | null>>(NO_SIDES)
  const [overlays, setOverlays] = useState<SideMap<OverlayLine[]>>(NO_OVERLAYS)
  const [side, setSide] = useState<CardSide>('front')
  const [message, setMessage] = useState<{ tone: 'error' | 'info'; text: string } | null>(null)
  /** コピーに失敗した文字列。手で選択できる欄に出す */
  const [failedCopy, setFailedCopy] = useState<string | null>(null)

  /** エンジンごとに使い回す。切り替えても、前に立てた Worker を捨てずに済む */
  const providersRef = useRef<Partial<Record<OcrEngine, OcrProvider>>>({})
  const failedCopyRef = useRef<HTMLInputElement>(null)
  const imagesRef = useRef<SideMap<PreparedImage | null>>(NO_SIDES)

  useEffect(() => {
    imagesRef.current = images
  }, [images])

  // コピーに失敗したときは、貼るだけで済むよう中身を選択しておく
  useEffect(() => {
    if (!failedCopy) return
    failedCopyRef.current?.focus()
    failedCopyRef.current?.select()
  }, [failedCopy])

  // 画面を離れるとき、Worker とプレビュー URL を必ず片付ける
  useEffect(() => {
    const providers = providersRef.current
    return () => {
      for (const image of Object.values(imagesRef.current)) {
        if (image) URL.revokeObjectURL(image.previewUrl)
      }
      if (ocrProvider) return
      for (const provider of Object.values(providers)) void provider.terminate()
    }
  }, [ocrProvider])

  function update<K extends keyof CardFields>(key: K, value: CardFields[K]) {
    setFields((current) => ({ ...current, [key]: value }))

    setErrors((current) => {
      if (!current[key as keyof CardFieldErrors]) return current
      const next = { ...current }
      // 「氏名か会社名のどちらか」は 2 欄で 1 つの条件なので、片方を直したら両方消す
      if (key === 'name' || key === 'company') {
        delete next.name
        delete next.company
      }
      delete next[key as keyof CardFieldErrors]
      return next
    })
  }

  function clearSide(target: CardSide) {
    const current = imagesRef.current[target]
    if (current) URL.revokeObjectURL(current.previewUrl)
    setImages((prev) => ({ ...prev, [target]: null }))
    clearSideResult(target)
  }

  /** 画像は残したまま、その面の読み取り結果だけを捨てる */
  function clearSideResult(target: CardSide) {
    setOverlays((prev) => ({ ...prev, [target]: [] }))
    setFallbackSide(null)
    setFields((current) =>
      target === 'front' ? { ...current, ocrText: '' } : { ...current, ocrTextBack: '' },
    )
  }

  async function handleCopy(text: string) {
    setMessage(null)
    if (await copyText(text)) {
      setFailedCopy(null)
      setMessage({ tone: 'info', text: `${COPIED_MESSAGE}「${text}」` })
      // 次のコピーの結果と混ざらないよう、この知らせだけを消す
      window.setTimeout(
        () => setMessage((current) => (current?.text.startsWith(COPIED_MESSAGE) ? null : current)),
        COPIED_MESSAGE_MS,
      )
      return
    }
    // 黙って失敗させない。手で選択できる欄を出す
    setFailedCopy(text)
    setMessage({ tone: 'error', text: COPY_FAILED_MESSAGE })
  }

  async function handleFile(target: CardSide, file: File | undefined) {
    if (!file) return
    setMessage(null)
    setProgress(0)

    let prepared: PreparedImage
    try {
      prepared = await prepareImage(file)
    } catch (error) {
      setMessage({
        tone: 'error',
        text: error instanceof ImageLoadError ? error.message : '画像を読み込めませんでした',
      })
      return
    }

    const previous = imagesRef.current[target]
    if (previous) URL.revokeObjectURL(previous.previewUrl)
    setImages((prev) => ({ ...prev, [target]: prepared }))
    // 前の画像の読み取り結果をここで捨てる。残すと、新しい画像の上に古い座標で
    // 文字が重なり、読み取りに失敗した場合は古い生テキストのまま登録されてしまう
    clearSideResult(target)
    setSide(target)

    await runOcr(target, prepared, engineFor(settings))
  }

  /** 1 面を読み取ってフォームと重ね表示に反映する。読み直しからも呼ぶ */
  async function runOcr(target: CardSide, prepared: PreparedImage, engine: OcrEngine) {
    setMessage(null)
    setFallbackSide(null)
    setProgress(0)
    setPhase('model')
    setReadingSide(target)

    try {
      // OCR の実装もモデルも重いので、実際に読み取るときまで読み込まない
      // （スマホで開いただけのときに何も落ちてこないようにするための肝）
      const provider = ocrProvider ?? (providersRef.current[engine] ??= await createOcrProvider(engine))
      const result = await provider.recognize(ocrInputBlob(engine, prepared), (update) => {
        setProgress(Math.round(update.progress * 100))
        setPhase(update.phase)
      })

      setOverlays((prev) => ({ ...prev, [target]: toOverlayLines(result.lines) }))
      // 項目の振り分けは表だけから行う。裏は連絡先の続きや英語表記のことが多く、
      // ここから埋めると表の正しい値を上書きしかねないので、生テキストだけ残す。
      setFields((current) =>
        target === 'front'
          ? { ...current, ...parseOcrLines(result.lines), ocrText: result.text }
          : { ...current, ocrTextBack: result.text },
      )
    } catch (error) {
      // OCR が失敗しても、手入力で登録できる状態にはする。
      // PaddleOCR はモデルの取得で落ちうるので、理由をそのまま見せて軽い方への逃げ道を出す
      const paddleFailed = error instanceof Error && error.name === 'PaddleOcrError'
      if (paddleFailed && engine === 'paddle') setFallbackSide(target)
      setMessage({
        tone: 'info',
        text: paddleFailed
          ? `${error.message}。フォームに直接入力して登録できます`
          : `${SIDE_LABELS[target]}の文字を読み取れませんでした。フォームに直接入力して登録できます。`,
      })
    } finally {
      setReadingSide(null)
    }
  }

  /** 重ね表示の ON/OFF。読み取り直しはしない（spec 9） */
  function toggleOcrText() {
    const next = !showOcrText
    setShowOcrText(next)
    if (settings) saveSettings({ ...settings, showOcrText: next })
  }

  // 一覧に戻る保存／その場で続けて次の 1 枚を登録する保存の両方から使う共通処理
  async function save(): Promise<Card | null> {
    const found = validateCard(fields)
    setErrors(found)
    if (hasErrors(found)) return null
    if (!repoRef) {
      setMessage({
        tone: 'error',
        text: '設定が未完了です。設定画面でリポジトリとトークンを入力してください',
      })
      return null
    }

    setSaving(true)
    setMessage(null)
    try {
      const card = await createCard(repoRef, {
        fields,
        ...(images.front ? { imageBase64: images.front.storageBase64 } : {}),
        ...(images.back ? { imageBackBase64: images.back.storageBase64 } : {}),
      })
      onCreated(card)
      return card
    } catch (error) {
      setMessage({
        tone: 'error',
        text: error instanceof Error ? error.message : '登録に失敗しました。もう一度お試しください',
      })
      return null
    } finally {
      setSaving(false)
    }
  }

  async function handleSave() {
    const card = await save()
    if (card) navigate('/', { replace: true })
  }

  const reading = readingSide !== null

  return (
    <>
      <AppHeader title="名刺を追加" backTo="/" backLabel="やめて一覧へ" />

      <main className="mx-auto max-w-2xl px-4 py-4 pb-28">
        <ImagePicker
          images={images}
          overlays={overlays}
          side={side}
          onFlip={() => setSide(otherSide(side))}
          readingSide={readingSide}
          progress={progress}
          phase={phase}
          showOcrText={showOcrText}
          onToggleOcrText={toggleOcrText}
          onFile={handleFile}
          onClear={clearSide}
          onCopy={(text) => void handleCopy(text)}
        />

        {message ? (
          <div className="mt-4">
            <Notice tone={message.tone === 'error' ? 'error' : 'info'}>{message.text}</Notice>
          </div>
        ) : null}

        {/* PaddleOCR のモデルを取れなかったときの逃げ道。軽い方なら通ることがある（spec 22） */}
        {fallbackSide ? (
          <div className="mt-2">
            <Button
              onClick={() => {
                const image = imagesRef.current[fallbackSide]
                if (image) void runOcr(fallbackSide, image, 'tesseract')
              }}
              disabled={reading}
            >
              {ENGINE_LABELS.tesseract}で読み直す
            </Button>
          </div>
        ) : null}

        {/* クリップボードが使えない環境の逃げ道。開いた時点で選択済みにしておく */}
        {failedCopy ? (
          <div className="mt-2">
            <label className="block">
              <span className="text-meta font-bold text-ink-soft">手でコピーする文字</span>
              <input
                ref={failedCopyRef}
                readOnly
                value={failedCopy}
                aria-label="手でコピーする文字"
                className="mt-1 min-h-tap w-full rounded-control border border-rule-strong bg-card px-3 py-2 text-base text-ink"
              />
            </label>
          </div>
        ) : null}

        <section className="mt-4 space-y-4 rounded-card border border-rule bg-card p-4 shadow-card sm:p-6">
          <h2 className="text-title font-bold text-ink">名刺の内容</h2>
          <p className="text-meta text-ink-faint">
            表の画像から自動で埋めた候補です。読み取りは完璧ではないので、必ず目で確かめて直してください。
          </p>

          <CardForm fields={fields} errors={errors} onChange={update} />
        </section>
      </main>

      {/* 主アクションは 1 つ。OCR 中と保存中は押せない（二重送信の抑止） */}
      <div className="fixed inset-x-0 bottom-0 border-t border-rule bg-paper/95 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-sheet backdrop-blur">
        <div className="mx-auto flex max-w-2xl gap-3">
          <Button
            variant="primary"
            className="flex-1"
            onClick={() => void handleSave()}
            disabled={reading || saving}
          >
            {saving ? '登録しています…' : reading ? '読み取り中…' : 'この内容で登録'}
          </Button>
        </div>
      </div>
    </>
  )
}
