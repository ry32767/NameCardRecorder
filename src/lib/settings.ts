import type { RepoRef } from './github/types'

const STORAGE_KEY = 'namecard.settings.v1'

export interface Settings {
  /** `owner/repo` 形式 */
  repository: string
  token: string
  /**
   * Google Cloud Vision の API キー。空なら OCR はブラウザ内の Tesseract を使う。
   * **入っている場合だけ名刺画像が Google に送られる**（docs/architecture.md のプライバシー節）。
   */
  visionApiKey: string
}

export const REPOSITORY_FORMAT_MESSAGE = 'owner/repo の形式で入力してください'

/** GitHub の owner / repo に使える文字だけを許す */
const REPOSITORY_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?\/[A-Za-z0-9._-]+$/

export function isValidRepository(value: string): boolean {
  return REPOSITORY_PATTERN.test(value.trim())
}

export function parseRepository(repository: string): { owner: string; repo: string } | null {
  const trimmed = repository.trim()
  if (!isValidRepository(trimmed)) return null
  const [owner, repo] = trimmed.split('/')
  if (!owner || !repo) return null
  return { owner, repo }
}

export function toRepoRef(settings: Settings): RepoRef | null {
  const parsed = parseRepository(settings.repository)
  if (!parsed || !settings.token) return null
  return { ...parsed, token: settings.token }
}

export function loadSettings(): Settings | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return null
    const { repository, token, visionApiKey } = parsed as Partial<Settings>
    if (typeof repository !== 'string' || typeof token !== 'string') return null
    // visionApiKey は後から足したフィールド。無い保存済み設定もそのまま読めるようにする
    return { repository, token, visionApiKey: typeof visionApiKey === 'string' ? visionApiKey : '' }
  } catch {
    // 壊れた値が入っていても落とさず「未設定」として扱う
    return null
  }
}

export function saveSettings(settings: Settings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
}

export function clearSettings(): void {
  localStorage.removeItem(STORAGE_KEY)
}

/**
 * トークンの伏せ字表示。実値は返さない。
 * 先頭のプレフィックス（github_pat_ / ghp_ など）だけ残すと、
 * どのトークンを入れたかは分かるが値は復元できない。
 */
export function maskToken(token: string): string {
  if (!token) return ''
  const visible = token.slice(0, Math.min(4, token.length))
  return `${visible}${'*'.repeat(8)}`
}

export function isSettingsComplete(settings: Settings | null): settings is Settings {
  return settings !== null && isValidRepository(settings.repository) && settings.token.length > 0
}

/** OCR に Cloud Vision を使うか。キーが入っているかどうかだけで決まる */
export function usesCloudVision(settings: Settings | null): boolean {
  return Boolean(settings?.visionApiKey)
}
