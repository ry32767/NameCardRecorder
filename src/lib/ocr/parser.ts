import {
  COMPANY_PATTERNS,
  DEPARTMENT_SUFFIXES,
  EMAIL_RE,
  HAS_LETTER_RE,
  KANA_ONLY_RE,
  PHONE_RE,
  POSTAL_BARE_RE,
  POSTAL_WITH_MARK_RE,
  PREFECTURES,
  TITLES,
  WEBSITE_RE,
} from './dictionaries'
import type { CardFields } from '../card/types'
import type { OcrLine } from './types'

/**
 * OCR の行テキストから名刺の項目を推定する純関数。
 *
 * docs/architecture.md の抽出ルールに従い、**確実なものから順に**潰していき、
 * 残った行から氏名を推定する。抽出結果はすべて「候補」で、ユーザーが確認フォームで直す前提。
 * **抽出できなかった項目は入れない**（推測で誤った値を入れるより空の方がよい）。
 */
export type ParsedCardFields = Partial<
  Pick<
    CardFields,
    | 'name'
    | 'nameKana'
    | 'company'
    | 'department'
    | 'title'
    | 'email'
    | 'phone'
    | 'mobile'
    | 'fax'
    | 'postalCode'
    | 'address'
    | 'website'
  >
>

interface WorkLine {
  /** 元のテキスト（trim 済み）。行全体をそのまま入れる項目はこちらを使う */
  text: string
  /** NFKC 正規化したテキスト。全角の TEL や数字を半角に寄せて判定・抽出する */
  norm: string
  /** まだ抽出に使われていない部分（抽出済みの箇所は空白で潰す） */
  rest: string
  bbox: OcrLine['bbox']
  /** この行が何らかの項目として使われたか。氏名の推定から除くために持つ */
  claimed: boolean
}


export function parseOcrText(text: string): ParsedCardFields {
  return parseOcrLines(text.split(/\r?\n/).map((line) => ({ text: line })))
}

export function parseOcrLines(lines: readonly OcrLine[]): ParsedCardFields {
  const work: WorkLine[] = lines
    .map((line) => {
      const text = line.text.trim()
      const norm = text.normalize('NFKC').trim()
      return { text, norm, rest: norm, bbox: line.bbox, claimed: false }
    })
    .filter((line) => line.text.length > 0)

  const fields: ParsedCardFields = {}

  extractEmail(work, fields)
  extractWebsite(work, fields)
  extractPostalAndAddress(work, fields)
  extractPhones(work, fields)
  extractCompany(work, fields)
  extractTitleAndDepartment(work, fields)
  extractNameKana(work, fields)
  extractName(work, fields)

  return fields
}

/** 抽出済みの箇所を空白で潰し、同じ文字列が別の項目に二重に使われないようにする */
function consume(line: WorkLine, matched: string): void {
  line.rest = line.rest.replace(matched, ' '.repeat(matched.length))
  line.claimed = true
}

function extractEmail(work: WorkLine[], fields: ParsedCardFields): void {
  for (const line of work) {
    const match = line.rest.match(EMAIL_RE)
    if (!match) continue
    fields.email ??= match[0]
    consume(line, match[0])
    return
  }
}

function extractWebsite(work: WorkLine[], fields: ParsedCardFields): void {
  for (const line of work) {
    const match = line.rest.match(WEBSITE_RE)
    if (!match) continue
    fields.website ??= match[0]
    consume(line, match[0])
    return
  }
}

function extractPostalAndAddress(work: WorkLine[], fields: ParsedCardFields): void {
  let postalIndex = -1

  for (const [index, line] of work.entries()) {
    const withMark = line.rest.match(POSTAL_WITH_MARK_RE)
    const bare = withMark ? null : line.rest.match(POSTAL_BARE_RE)
    const match = withMark ?? bare
    if (!match) continue

    fields.postalCode = `${match[1]}-${match[2]}`
    consume(line, match[0])
    postalIndex = index

    // 郵便番号と同じ行の続きが住所（docs/architecture.md）
    const remainder = line.rest.replace(/^[\s〒]+/, '').trim()
    if (remainder.length > 0) {
      fields.address = remainder
      line.rest = ''
    }
    break
  }

  if (fields.address) return

  // 都道府県名で始まる行
  for (const line of work) {
    if (line.claimed && !line.rest.trim()) continue
    const candidate = line.rest.trim()
    if (PREFECTURES.some((prefecture) => candidate.startsWith(prefecture))) {
      fields.address = candidate
      line.rest = ''
      line.claimed = true
      return
    }
  }

  // 郵便番号だけの行だったときは、その次の行（数字を含む＝番地らしい行）を住所とみなす
  if (postalIndex >= 0) {
    const next = work[postalIndex + 1]
    if (next && !next.claimed && /\d/.test(next.rest)) {
      fields.address = next.rest.trim()
      next.rest = ''
      next.claimed = true
    }
  }
}

type PhoneLabel = 'tel' | 'fax' | 'mobile'

/** 番号の直前のテキストからラベルを読む。行頭〜前の番号の終わりまでだけを見る */
export function detectPhoneLabel(prefix: string): PhoneLabel | undefined {
  const upper = prefix.toUpperCase()
  if (/FAX|ファックス/.test(upper)) return 'fax'
  if (/携帯|MOBILE|CELL|(^|[^A-Z])MOB\.?\s*$|(^|[^A-Z])M\.\s*$/.test(upper)) return 'mobile'
  if (/TEL|電話|PHONE|代表|(^|[^A-Z])T\.\s*$/.test(upper)) return 'tel'
  return undefined
}

function extractPhones(work: WorkLine[], fields: ParsedCardFields): void {
  for (const line of work) {
    PHONE_RE.lastIndex = 0
    let cursor = 0
    let match: RegExpExecArray | null

    while ((match = PHONE_RE.exec(line.rest)) !== null) {
      const number = match[0]
      const prefix = line.rest.slice(cursor, match.index)
      cursor = match.index + number.length

      const label = detectPhoneLabel(prefix)
      const target: PhoneLabel = label ?? (isMobileNumber(number) ? 'mobile' : 'tel')

      if (target === 'fax') fields.fax ??= number
      else if (target === 'mobile') fields.mobile ??= number
      else fields.phone ??= number

      line.claimed = true
    }

    if (line.claimed) {
      // ラベル文字だけが残るので、氏名の候補から外す
      line.rest = line.rest.replace(PHONE_RE, ' ')
    }
  }
}

function isMobileNumber(number: string): boolean {
  return /^0[789]0/.test(number)
}

function extractCompany(work: WorkLine[], fields: ParsedCardFields): void {
  for (const line of work) {
    if (line.claimed) continue
    if (!COMPANY_PATTERNS.some((pattern) => pattern.test(line.norm))) continue
    // ㈱ のような合字は正規化すると別の字になるため、値は元の行をそのまま採る
    fields.company = line.text
    line.claimed = true
    return
  }
}

function extractTitleAndDepartment(work: WorkLine[], fields: ParsedCardFields): void {
  for (const line of work) {
    if (line.claimed) continue

    const found = TITLES.find((title) => matchesTitle(line.text, title))
    if (!found) continue

    fields.title ??= found
    const remainder = line.text.replace(found, ' ').replace(/\s+/g, ' ').trim()
    line.claimed = true

    if (remainder && looksLikeDepartment(remainder)) {
      fields.department ??= remainder
    }
    break
  }

  if (fields.department) return

  for (const line of work) {
    if (line.claimed) continue
    if (!looksLikeDepartment(line.text)) continue
    fields.department = line.text
    line.claimed = true
    return
  }
}

/** 英字の役職は語として一致させる（Head が Header に当たらないように） */
function matchesTitle(text: string, title: string): boolean {
  if (/^[A-Za-z.]+$/.test(title)) {
    return new RegExp(`(^|[^A-Za-z])${escapeRegExp(title)}([^A-Za-z]|$)`, 'i').test(text)
  }
  return text.includes(title)
}

function looksLikeDepartment(text: string): boolean {
  return DEPARTMENT_SUFFIXES.some((suffix) => text.endsWith(suffix))
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function extractNameKana(work: WorkLine[], fields: ParsedCardFields): void {
  for (const line of work) {
    if (line.claimed) continue
    if (line.text.length > 24) continue
    if (!KANA_ONLY_RE.test(line.text)) continue
    fields.nameKana = line.text
    line.claimed = true
    return
  }
}

/**
 * 残った行から氏名を推定する。
 * bbox があれば **文字の高さが最大**の行、無ければ最も上（＝先頭）の短い行。
 */
function extractName(work: WorkLine[], fields: ParsedCardFields): void {
  const candidates = work.filter(
    (line) => !line.claimed && HAS_LETTER_RE.test(line.text) && line.text.length <= 24,
  )
  if (candidates.length === 0) return

  const withBbox = candidates.filter((line) => line.bbox !== undefined)
  if (withBbox.length > 0) {
    const tallest = withBbox.reduce((best, line) =>
      lineHeight(line) > lineHeight(best) ? line : best,
    )
    fields.name = tallest.text
    tallest.claimed = true
    return
  }

  const first = candidates[0]
  if (!first) return
  fields.name = first.text
  first.claimed = true
}

function lineHeight(line: WorkLine): number {
  return line.bbox ? line.bbox.y1 - line.bbox.y0 : 0
}
