import { useRef, useState } from 'react'
import { AppHeader } from '../components/AppHeader'
import { Button } from '../components/Button'
import { Notice } from '../components/Notice'
import { TextField } from '../components/TextField'
import { fetchRepo } from '../lib/github/repo'
import { GithubError } from '../lib/github/errors'
import {
  REPOSITORY_FORMAT_MESSAGE,
  isValidRepository,
  maskToken,
  parseRepository,
} from '../lib/settings'
import { useSettings } from '../store/settingsContext'

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
  const [editingVisionKey, setEditingVisionKey] = useState(!settings?.visionApiKey)

  /**
   * トークンは state に持たず、非制御の input から必要なときだけ読む。
   * React が value を DOM に書き戻さないので、保存済みトークンが属性に現れない
   * （docs/spec.md 機能0 / DESIGN.md 不変条件 7）。Vision の API キーも同じ扱いにする。
   */
  const tokenRef = useRef<HTMLInputElement>(null)
  const visionKeyRef = useRef<HTMLInputElement>(null)

  function readToken(): string {
    const typed = tokenRef.current?.value.trim() ?? ''
    return typed || settings?.token || ''
  }

  function readVisionKey(): string {
    const typed = visionKeyRef.current?.value.trim() ?? ''
    return typed || settings?.visionApiKey || ''
  }

  function validate(): { repository: string; token: string; visionApiKey: string } | null {
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
    return { repository: repository.trim(), token, visionApiKey: readVisionKey() }
  }

  function handleSave() {
    const valid = validate()
    if (!valid) return
    save(valid)
    if (tokenRef.current) tokenRef.current.value = ''
    if (visionKeyRef.current) visionKeyRef.current.value = ''
    setEditingToken(false)
    setEditingVisionKey(!valid.visionApiKey)
    setResult({ tone: 'success', message: '設定を保存しました' })
  }

  /** Cloud Vision をやめてブラウザ内 OCR に戻す。キーはこの端末から消える */
  function handleRemoveVisionKey() {
    if (!settings) return
    if (visionKeyRef.current) visionKeyRef.current.value = ''
    save({ ...settings, visionApiKey: '' })
    setEditingVisionKey(true)
    setResult({ tone: 'success', message: 'API キーを消し、ブラウザ内の OCR に戻しました' })
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
    setConfirmingClear(false)
    setEditingToken(true)
    setEditingVisionKey(true)
    if (tokenRef.current) tokenRef.current.value = ''
    if (visionKeyRef.current) visionKeyRef.current.value = ''
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
            既定はこの端末のブラウザ内で読み取ります（画像は外に出ませんが、精度は高くありません）。
            <strong className="font-bold text-ink">Google Cloud Vision の API キー</strong>
            を入れると精度の高い読み取りに切り替わります。
          </p>
          <p className="mt-2 text-meta text-vermilion">
            キーを入れている間は、<strong className="font-bold">名刺の画像が Google に送信されます。</strong>
            無料枠を超えると課金されます。
          </p>

          <div className="mt-4">
            <span className="mb-1 block text-meta font-bold text-ink-soft">
              Cloud Vision の API キー
              <span className="ml-1 text-ink-faint">（任意）</span>
            </span>

            {settings?.visionApiKey && !editingVisionKey ? (
              <div className="flex flex-wrap items-center gap-3">
                {/* 実値ではなく伏せ字だけを描く */}
                <output className="font-mono text-base text-ink-soft">
                  {maskToken(settings.visionApiKey)}
                </output>
                <Button onClick={() => setEditingVisionKey(true)}>キーを変更</Button>
                <Button variant="danger" onClick={handleRemoveVisionKey}>
                  キーを消す
                </Button>
              </div>
            ) : (
              <>
                <input
                  ref={visionKeyRef}
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="AIza…"
                  aria-label="Cloud Vision の API キー"
                  className="min-h-tap w-full rounded-control border border-rule-strong bg-card px-3 py-2 font-mono text-base text-ink placeholder:text-ink-faint"
                />
                <p className="mt-1 text-meta text-ink-faint">
                  Google Cloud で Cloud Vision API を有効にして発行したキーを貼り、「保存」を押してください。
                  キーはブラウザから送るため URL に載ります。Google Cloud
                  側でこのアプリのドメインに <strong className="font-bold text-ink">HTTP リファラー制限</strong>{' '}
                  を掛け、用途を Cloud Vision API だけに絞ってください。空のままなら Cloud Vision は使いません。
                </p>
              </>
            )}
          </div>
        </section>

        <section className="mt-8 rounded-card border border-rule bg-card p-4 shadow-card sm:p-6">
          <h2 className="text-title font-bold text-ink">設定を消去</h2>
          <p className="mt-1 text-base text-ink-soft">
            この端末に保存されたトークン・API キー・リポジトリ設定・一覧のキャッシュをすべて消します。
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
