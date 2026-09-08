import { formatYamlLine, parseYamlBlock } from './yaml'
import { YAML_FIELDS, emptyCardFields } from './types'
import type { CardFields, YamlField } from './types'

export const SCHEMA_MARKER = '<!-- namecard:v1 -->'
const MEMO_HEADING = '## メモ'
const IMAGE_HEADING = '## 名刺画像'
const OCR_SUMMARY_FRONT = 'OCR 生テキスト（表）'
const OCR_SUMMARY_BACK = 'OCR 生テキスト（裏）'
/** v1 初期の本文は表裏の区別が無く、この summary だけを持っていた */
const OCR_SUMMARY_LEGACY = 'OCR 生テキスト'

/** 氏名が空でもタイトルは作れるようにする（docs/architecture.md） */
export const NAME_PLACEHOLDER = '(氏名未入力)'

export function buildIssueTitle(fields: Pick<CardFields, 'name' | 'company'>): string {
  const name = fields.name.trim() || NAME_PLACEHOLDER
  const company = fields.company.trim()
  return company ? `${name} - ${company}` : name
}

export interface ImageUrlContext {
  owner: string
  repo: string
  branch: string
}

export function buildImageUrl(path: string, ctx: ImageUrlContext): string {
  return `https://github.com/${ctx.owner}/${ctx.repo}/blob/${ctx.branch}/${path}?raw=true`
}

/** タグにカンマが入ると YAML の 1 行表現で区切りと区別できなくなるので落とす */
export function normalizeTags(tags: readonly string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const raw of tags) {
    const tag = raw.replace(/,/g, ' ').trim().replace(/\s+/g, ' ')
    if (!tag || seen.has(tag)) continue
    seen.add(tag)
    result.push(tag)
  }
  return result
}

/**
 * フィールドから Issue 本文を組み立てる。
 * **空の値はキーごと省略する**（docs/architecture.md）。
 */
export function serializeIssueBody(fields: CardFields, ctx: ImageUrlContext): string {
  const yamlLines: string[] = []
  for (const key of YAML_FIELDS) {
    const value = fields[key].trim()
    if (!value) continue // 空はキーごと書かない
    yamlLines.push(formatYamlLine(key, value))
  }
  const tags = normalizeTags(fields.tags)
  if (tags.length > 0) yamlLines.push(formatYamlLine('tags', tags.join(', ')))

  const sections: string[] = [SCHEMA_MARKER, '', '```yaml', ...yamlLines, '```']

  const memo = fields.memo.trim()
  if (memo) sections.push('', MEMO_HEADING, '', memo)

  const image = fields.image.trim()
  const imageBack = fields.imageBack.trim()
  if (image || imageBack) {
    sections.push('', IMAGE_HEADING, '')
    if (image) sections.push(`![名刺（表）](${buildImageUrl(image, ctx)})`)
    if (imageBack) sections.push(`![名刺（裏）](${buildImageUrl(imageBack, ctx)})`)
  }

  sections.push(...ocrSection(fields.ocrText, OCR_SUMMARY_FRONT))
  sections.push(...ocrSection(fields.ocrTextBack, OCR_SUMMARY_BACK))

  return `${sections.join('\n')}\n`
}

function ocrSection(text: string, summary: string): string[] {
  const trimmed = text.trim()
  if (!trimmed) return []
  return ['', `<details><summary>${summary}</summary>`, '', '```text', trimmed, '```', '', '</details>']
}

/**
 * Issue 本文からフィールドを復元する。
 * スキーマのマーカーが無い／知らない版でも、YAML ブロックが読めれば読む
 * （後方互換のパーサを残す方針。docs/architecture.md）。
 */
export function parseIssueBody(body: string | null): CardFields {
  const fields = emptyCardFields()
  if (!body) return fields

  const normalized = body.replace(/\r\n/g, '\n')

  const yamlMatch = normalized.match(/```ya?ml\n([\s\S]*?)\n?```/)
  if (yamlMatch?.[1] !== undefined) {
    const values = parseYamlBlock(yamlMatch[1])
    for (const key of YAML_FIELDS satisfies readonly YamlField[]) {
      const value = values[key]
      if (typeof value === 'string') fields[key] = value
    }
    const tags = values['tags']
    if (typeof tags === 'string') {
      fields.tags = normalizeTags(tags.split(','))
    }
  }

  fields.memo = extractMemo(normalized)

  const ocrBlocks = extractDetailsBlocks(normalized)
  // 表裏の区別が無い旧形式（summary が「OCR 生テキスト」だけ）は表として読む
  fields.ocrText = ocrBlocks.get(OCR_SUMMARY_FRONT) ?? ocrBlocks.get(OCR_SUMMARY_LEGACY) ?? ''
  fields.ocrTextBack = ocrBlocks.get(OCR_SUMMARY_BACK) ?? ''

  return fields
}

function extractMemo(body: string): string {
  const start = body.indexOf(`\n${MEMO_HEADING}`)
  if (start === -1) return ''
  const after = body.slice(start + MEMO_HEADING.length + 1)
  // 次の見出し、または details ブロックの手前まで
  const end = after.search(/\n## |\n<details/)
  return (end === -1 ? after : after.slice(0, end)).trim()
}

/**
 * 本文中のすべての details ブロックを summary → 中身の Map にする。
 * 表裏で 2 つ並ぶので、最初の 1 つだけを取る実装にすると裏が読めなくなる。
 */
function extractDetailsBlocks(body: string): Map<string, string> {
  const blocks = new Map<string, string>()
  const pattern = /<details><summary>([^<]*)<\/summary>\n([\s\S]*?)<\/details>/g

  let match: RegExpExecArray | null
  while ((match = pattern.exec(body)) !== null) {
    const summary = (match[1] ?? '').trim()
    const inner = match[2] ?? ''
    const fenced = inner.match(/```(?:text)?\n([\s\S]*?)\n?```/)
    blocks.set(summary, (fenced?.[1] ?? inner).trim())
  }
  return blocks
}
