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
import { createOcrProvider, engineFor, ocrInputBlob } from '../lib/ocr/engine'
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
import type { OcrProvider } from '../lib/ocr/types'

type SideMap<T> = Record<CardSide, T>

export const COPIED_MESSAGE = 'コピーしました'
export const COPY_FAILED_MESSAGE = 'コピーできませんでした。下の欄から手で選択してください'

const NO_SIDES: SideMap<null> = { front: null, back: null }
const NO_OVERLAYS: SideMap<OverlayLine[]> = { front: [], back: [] }

export function NewCard({
  onCreated,
  ocrProvider,
}: {
  onCreated: (card: Card) => void
  /** テストや将来のクラウド OCR 差し替え用。既定は Tesseract */
  ocrProvider?: OcrProvider
}) {
  const navigate = useNavigate()
  const { settings, repoRef } = useSettings()

  const [fields, setFields] = useState<CardFields>(() => ({
    ...emptyCardFields(),
    metOn: todayIso(),
  }))
  const [errors, setErrors] = useState<CardFieldErrors>({})
  const [saving, setSaving] = useState(false)
  const [readingSide, setReadingSide] = useState<CardSide | null>(null)
  const [progress, setProgress] = useState(0)
  const [images, setImages] = useState<SideMap<PreparedImage | null>>(NO_SIDES)
  const [overlays, setOverlays] = useState<SideMap<OverlayLine[]>>(NO_OVERLAYS)
  const [side, setSide] = useState<CardSide>('front')
  const [message, setMessage] = useState<{ tone: 'error' | 'info'; text: string } | null>(null)
  /** コピーに失敗した文字列。手で選択できる欄に出す */
  const [failedCopy, setFailedCopy] = useState<string | null>(null)

  const providerRef = useRef<OcrProvider | null>(ocrProvider ?? null)
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
    return () => {
      for (const image of Object.values(imagesRef.current)) {
        if (image) URL.revokeObjectURL(image.previewUrl)
      }
      if (!ocrProvider) void providerRef.current?.terminate()
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
    setOverlays((prev) => ({ ...prev, [target]: [] }))
    setFields((current) =>
      target === 'front' ? { ...current, ocrText: '' } : { ...current, ocrTextBack: '' },
    )
  }

  async function handleCopy(text: string) {
    setMessage(null)
    if (await copyText(text)) {
      setFailedCopy(null)
      setMessage({ tone: 'info', text: COPIED_MESSAGE })
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
    setSide(target)
    setReadingSide(target)

    const engine = engineFor(settings)
    try {
      // OCR の実装は重いので、実際に読み取るときまで読み込まない（初期表示を軽く保つ）
      providerRef.current ??= await createOcrProvider(engine, settings)
      const result = await providerRef.current.recognize(
        ocrInputBlob(engine, prepared),
        (update) => setProgress(Math.round(update.progress * 100)),
      )

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
      // Cloud Vision のキー・課金の問題はここでしか気づけないので、理由をそのまま見せる
      setMessage({
        tone: 'info',
        text:
          error instanceof Error && error.name === 'VisionOcrError'
            ? `${error.message}（フォームに直接入力して登録できます）`
            : `${SIDE_LABELS[target]}の文字を読み取れませんでした。フォームに直接入力して登録できます。`,
      })
    } finally {
      setReadingSide(null)
    }
  }

  async function handleSave() {
    const found = validateCard(fields)
    setErrors(found)
    if (hasErrors(found)) return
    if (!repoRef) {
      setMessage({
        tone: 'error',
        text: '設定が未完了です。設定画面でリポジトリとトークンを入力してください',
      })
      return
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
      navigate('/', { replace: true })
    } catch (error) {
      setSaving(false)
      setMessage({
        tone: 'error',
        text: error instanceof Error ? error.message : '登録に失敗しました。もう一度お試しください',
      })
    }
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
          onFile={handleFile}
          onClear={clearSide}
          onCopy={(text) => void handleCopy(text)}
        />

        {message ? (
          <div className="mt-4">
            <Notice tone={message.tone === 'error' ? 'error' : 'info'}>{message.text}</Notice>
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
