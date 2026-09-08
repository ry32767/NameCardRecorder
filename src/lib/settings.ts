import type { RepoRef } from './github/types'
import type { OcrEngine } from './ocr/engine'

const STORAGE_KEY = 'namecard.settings.v1'

export interface Settings {
  /** `owner/repo` 形式 */
  repository: string
  token: string
  /**
   * どの OCR で読むか。どちらもブラウザ内で完結し、**画像は端末から出ない**
   * （docs/architecture.md のプライバシー前提）。
   */
  ocrEngine: OcrEngine
  /** 読み取った文字を画像の上に重ねて表示するか。OCR 自体の実行には影響しない */
  showOcrText: boolean
}

/** 既定の OCR。PaddleOCR の方が日本語の精度が高い（docs/architecture.md の設計判断） */
export const DEFAULT_OCR_ENGINE: OcrEngine = 'paddle'

function isOcrEngine(value: unknown): value is OcrEngine {
  return value === 'paddle' || value === 'tesseract'
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
    const stored = parsed as Partial<Settings> & { visionApiKey?: unknown }
    const { repository, token } = stored
    if (typeof repository !== 'string' || typeof token !== 'string') return null

    // ocrEngine / showOcrText は後から足したフィールド。無い保存済み設定もそのまま読めるようにする
    const settings: Settings = {
      repository,
      token,
      ocrEngine: isOcrEngine(stored.ocrEngine) ? stored.ocrEngine : DEFAULT_OCR_ENGINE,
      showOcrText: typeof stored.showOcrText === 'boolean' ? stored.showOcrText : true,
    }

    // Cloud Vision をやめたので、以前保存された API キーはこの端末から消す。
    // 使わないキーを localStorage に置き続けない（消すには読んだここで書き戻すしかない）
    if ('visionApiKey' in stored) saveSettings(settings)

    return settings
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

/**
 * 設定の変更で、ローカルキャッシュを捨てる必要があるか。
 *
 * キャッシュは「リポジトリ + トークンの持ち主」単位（docs/architecture.md）。
 * **OCR の設定を変えただけで捨ててはいけない** — 重ね表示の ON/OFF のような軽い操作で
 * 一覧のキャッシュと最終同期時刻まで消えると、次の起動で全件を取り直すことになる。
 */
export function needsCacheReset(previous: Settings | null, next: Settings): boolean {
  if (!previous) return false
  return previous.repository !== next.repository || previous.token !== next.token
}

export function isSettingsComplete(settings: Settings | null): settings is Settings {
  return settings !== null && isValidRepository(settings.repository) && settings.token.length > 0
}
