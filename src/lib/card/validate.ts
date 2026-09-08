import type { CardFields } from './types'

export const EMAIL_INVALID_MESSAGE = 'メールアドレスの形式が正しくありません'
export const NAME_OR_COMPANY_REQUIRED_MESSAGE = '氏名か会社名のどちらかは入力してください'
export const WEBSITE_INVALID_MESSAGE = 'URL の形式が正しくありません'

// 名刺に印字されうる範囲を通す実務的な判定。RFC 完全準拠は狙わない
const EMAIL_RE = /^[^\s@,]+@[^\s@,.]+(\.[^\s@,.]+)+$/

export function isValidEmail(value: string): boolean {
  return EMAIL_RE.test(value.trim())
}

export function isValidWebsite(value: string): boolean {
  const trimmed = value.trim()
  if (/\s/.test(trimmed)) return false
  // スキーム無しの `example.co.jp` や `www.example.com` も名刺には普通に印字される
  return /^(https?:\/\/)?[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(trimmed)
}

export type CardFieldErrors = Partial<Record<'name' | 'company' | 'email' | 'website', string>>

/**
 * 保存前の検証。
 * 「氏名か会社名のどちらかは必須」「メールは形式チェック」だけを合格ラインにする
 * （docs/spec.md 機能2）。それ以外は空でも登録できる。
 */
export function validateCard(fields: CardFields): CardFieldErrors {
  const errors: CardFieldErrors = {}

  if (!fields.name.trim() && !fields.company.trim()) {
    errors.name = NAME_OR_COMPANY_REQUIRED_MESSAGE
    errors.company = NAME_OR_COMPANY_REQUIRED_MESSAGE
  }

  if (fields.email.trim() && !isValidEmail(fields.email)) {
    errors.email = EMAIL_INVALID_MESSAGE
  }

  if (fields.website.trim() && !isValidWebsite(fields.website)) {
    errors.website = WEBSITE_INVALID_MESSAGE
  }

  return errors
}

export function hasErrors(errors: CardFieldErrors): boolean {
  return Object.keys(errors).length > 0
}

/** 「出会った日」の既定値。ローカル時刻の今日（UTC にずらさない） */
export function todayIso(now: Date = new Date()): string {
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
