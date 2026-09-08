import { useRef, useState } from 'react'
import { AppHeader } from '../components/AppHeader'
import { Button } from '../components/Button'
import { Notice } from '../components/Notice'
import { TextField } from '../components/TextField'
import { fetchRepo } from '../lib/github/repo'
import { GithubError } from '../lib/github/errors'
import {
  DEFAULT_OCR_ENGINE,
  REPOSITORY_FORMAT_MESSAGE,
  isValidRepository,
  maskToken,
  parseRepository,
} from '../lib/settings'
import { ENGINE_LABELS } from '../lib/ocr/engine'
import { useSettings } from '../store/settingsContext'
import type { OcrEngine } from '../lib/ocr/engine'
import type { Settings as SettingsValue } from '../lib/settings'

/** OCR エンジンの選択肢。どちらもブラウザ内で完結する（画像は端末から出ない） */
const OCR_ENGINE_CHOICES: { engine: OcrEngine; hint: string }[] = [
  {
    engine: 'paddle',
    hint: '日本語の精度が高い。初回だけモデル（約 21MB）を取得します',
  },
  {
    engine: 'tesseract',
    hint: '取得するデータが小さく、非力な端末でも動きます。精度は落ちます',
  },
]

export const CONNECTED_MESSAGE = '接続できました'
export const TOKEN_REQUIRED_MESSAGE = 'アクセストークンを入力してください'

type Result = { tone: 'success' | 'error'; message: string } | null

export function Settings() {
  const { settings, save, clear } = useSettings()

  const [repository, setRepository] = useState(settings?.repository ?? '')
  const [repositoryError, setRepositoryError] = useState<string | null>(null)
  const [result, setResult] = useState<Result>(null)
  const [testing, setTesting] = useState(false)
  const [confirmingClear, setConfirmingClear] = useState(false)
  const [editingToken, setEditingToken] = useState(!settings?.token)
  /**
   * OCR の設定は、リポジトリ・トークンと同じく画面側に持つ。
   * **設定を保存する前（初回）でも選べるようにするため** — 保存済みの値だけを見ていると、
   * まだ設定が無い利用者がラジオを押しても何も起きない。
   */
  const [ocrEngine, setOcrEngine] = useState<OcrEngine>(settings?.ocrEngine ?? DEFAULT_OCR_ENGINE)
  const [showOcrText, setShowOcrText] = useState(settings?.showOcrText ?? true)

  /**
   * トークンは state に持たず、非制御の input から必要なときだけ読む。
   * React が value を DOM に書き戻さないので、保存済みトークンが属性に現れない
   * （docs/spec.md 機能0 / DESIGN.md 不変条件 7）。
   */
  const tokenRef = useRef<HTMLInputElement>(null)

  function readToken(): string {
    const typed = tokenRef.current?.value.trim() ?? ''
    return typed || settings?.token || ''
  }

  function validate(): SettingsValue | null {
    setResult(null)
    if (!isValidRepository(repository)) {
      setRepositoryError(REPOSITORY_FORMAT_MESSAGE)
      return null
    }
    setRepositoryError(null)

    const token = readToken()
    if (!token) {
      setResult({ tone: 'error', message: TOKEN_REQUIRED_MESSAGE })
      return null
    }
    return { repository: repository.trim(), token, ocrEngine, showOcrText }
  }

  function handleSave() {
    const valid = validate()
    if (!valid) return
    save(valid)
    if (tokenRef.current) tokenRef.current.value = ''
    setEditingToken(false)
    setResult({ tone: 'success', message: '設定を保存しました' })
  }

  /**
   * OCR の設定は「保存」を待たずにその場で効かせる。
   * リポジトリ・トークンと違って検証するものが無く、次の読み取りから使う値なので
   * （spec 17: エンジンを変えたら次回の OCR から新しい方を使う）。
   */
  function updateOcr(patch: Partial<Pick<SettingsValue, 'ocrEngine' | 'showOcrText'>>) {
    if (patch.ocrEngine !== undefined) setOcrEngine(patch.ocrEngine)
    if (patch.showOcrText !== undefined) setShowOcrText(patch.showOcrText)
    // まだ設定が無いなら、リポジトリ・トークンと一緒に「保存」で残る
    if (settings) save({ ...settings, ...patch })
  }

  async function handleTest() {
    const valid = validate()
    if (!valid) return

    const parsed = parseRepository(valid.repository)
    if (!parsed) {
      setRepositoryError(REPOSITORY_FORMAT_MESSAGE)
      return
    }

    setTesting(true)
    try {
      await fetchRepo({ ...parsed, token: valid.token })
      setResult({ tone: 'success', message: CONNECTED_MESSAGE })
    } catch (error) {
      // 401 と 404 を別の文言で出す（docs/spec.md 機能0）
      setResult({
        tone: 'error',
        message:
          error instanceof GithubError
            ? error.message
            : 'GitHub との通信に失敗しました。もう一度お試しください',
      })
    } finally {
      setTesting(false)
    }
  }

  async function handleClear() {
    await clear()
    setRepository('')
    setRepositoryError(null)
    setOcrEngine(DEFAULT_OCR_ENGINE)
    setShowOcrText(true)
    setConfirmingClear(false)
    setEditingToken(true)
    if (tokenRef.current) tokenRef.current.value = ''
    setResult({ tone: 'success', message: '設定とローカルキャッシュを消去しました' })
  }

  return (
    <>
      <AppHeader title="設定" backTo={settings ? '/' : undefined} />

      <main className="mx-auto max-w-2xl px-4 py-6">
        <p className="mb-6 text-base text-ink-soft">
          名刺データを保存する <strong className="font-bold text-ink">private リポジトリ</strong>{' '}
          と、そのリポジトリの Issues / Contents を操作できるアクセストークンを設定します。
          トークンはこの端末のブラウザにだけ保存され、外部には送信されません。
        </p>

        <div className="space-y-5 rounded-card border border-rule bg-card p-4 shadow-card sm:p-6">
          <TextField
            label="データリポジトリ"
            placeholder="owner/repo"
            hint="例: sample-user/namecard-data"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            required
            value={repository}
            error={repositoryError ?? undefined}
            onChange={(event) => {
              setRepository(event.target.value)
              if (repositoryError) setRepositoryError(null)
            }}
          />

          <div>
            <span className="mb-1 block text-meta font-bold text-ink-soft">
              アクセストークン
              <span className="ml-1 text-vermilion">（必須）</span>
            </span>

            {settings?.token && !editingToken ? (
              <div className="flex flex-wrap items-center gap-3">
                {/* 実値ではなく伏せ字だけを描く */}
                <output className="font-mono text-base text-ink-soft">
                  {maskToken(settings.token)}
                </output>
                <Button onClick={() => setEditingToken(true)}>トークンを変更</Button>
              </div>
            ) : (
              <>
                <input
                  ref={tokenRef}
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="github_pat_… / ghp_…"
                  aria-label="アクセストークン"
                  className="min-h-tap w-full rounded-control border border-rule-strong bg-card px-3 py-2 font-mono text-base text-ink placeholder:text-ink-faint"
                />
                <p className="mt-1 text-meta text-ink-faint">
                  データリポジトリの Issues と Contents だけに権限を絞った Fine-grained
                  トークンを使ってください。
                </p>
              </>
            )}
          </div>

          {result ? <Notice tone={result.tone}>{result.message}</Notice> : null}

          <div className="flex flex-wrap gap-3">
            <Button variant="primary" onClick={handleSave}>
              保存
            </Button>
            <Button onClick={() => void handleTest()} disabled={testing}>
              {testing ? '接続を確認中…' : '接続テスト'}
            </Button>
          </div>
        </div>

        <section className="mt-8 rounded-card border border-rule bg-card p-4 shadow-card sm:p-6">
          <h2 className="text-title font-bold text-ink">文字認識（OCR）</h2>
          <p className="mt-1 text-base text-ink-soft">
            どちらも<strong className="font-bold text-ink">この端末のブラウザの中だけ</strong>
            で読み取ります。名刺の画像が OCR サービスへ送られることはありません
            （取得するのは読み取り用のモデルだけです）。
          </p>

          <fieldset className="mt-4">
            <legend className="mb-1 text-meta font-bold text-ink-soft">OCR エンジン</legend>
            <div className="space-y-2">
              {OCR_ENGINE_CHOICES.map(({ engine, hint }) => (
                <label
                  key={engine}
                  className="flex min-h-tap cursor-pointer items-start gap-3 rounded-control border border-rule px-3 py-2"
                >
                  <input
                    type="radio"
                    name="ocrEngine"
                    className="mt-1 h-5 w-5 accent-indigo"
                    value={engine}
                    checked={ocrEngine === engine}
                    onChange={() => updateOcr({ ocrEngine: engine })}
                  />
                  <span>
                    <span className="block text-base font-bold text-ink">{ENGINE_LABELS[engine]}</span>
                    <span className="block text-meta text-ink-faint">{hint}</span>
                  </span>
                </label>
              ))}
            </div>
            <p className="mt-1 text-meta text-ink-faint">
              変えたときは、次に読み取る名刺から新しい方を使います。
            </p>
          </fieldset>

          <div className="mt-4">
            <label className="flex min-h-tap cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                className="mt-1 h-5 w-5 accent-indigo"
                checked={showOcrText}
                onChange={(event) => updateOcr({ showOcrText: event.target.checked })}
              />
              <span>
                <span className="block text-base font-bold text-ink">認識テキストを画像上に表示</span>
                <span className="block text-meta text-ink-faint">
                  読み取った文字を名刺画像の上に重ね、押すとコピーできるようにします。
                  OFF にしても読み取り自体は行い、結果はフォームに入ります。
                </span>
              </span>
            </label>
          </div>
        </section>

        <section className="mt-8 rounded-card border border-rule bg-card p-4 shadow-card sm:p-6">
          <h2 className="text-title font-bold text-ink">設定を消去</h2>
          <p className="mt-1 text-base text-ink-soft">
            この端末に保存されたトークン・リポジトリ設定・OCR の設定・一覧のキャッシュをすべて消します。
            GitHub 側の名刺データは消えません。
          </p>

          {confirmingClear ? (
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <span className="text-base font-bold text-ink">本当に消去しますか？</span>
              <Button variant="danger" onClick={() => void handleClear()}>
                消去する
              </Button>
              <Button onClick={() => setConfirmingClear(false)}>やめる</Button>
            </div>
          ) : (
            <div className="mt-4">
              <Button variant="danger" onClick={() => setConfirmingClear(true)}>
                設定を消去
              </Button>
            </div>
          )}
        </section>
      </main>
    </>
  )
}
