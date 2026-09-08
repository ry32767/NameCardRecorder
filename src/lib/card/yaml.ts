/**
 * Issue 本文の YAML ブロックを読み書きする最小実装。
 *
 * 依存を増やさない（AGENTS.md）ため yaml パッケージは入れず、
 * 「1 階層・文字列だけ」という限定された形にのみ対応する自前の実装にしている。
 * ただし名刺の値には `住所: 東京都... 1-1-1` や `会社名: A: B` のように
 * コロン・先頭記号・改行が普通に入りうるので、そこは必ず引用符で守る。
 */

/** 引用が必要か。ここを緩めるとデータが静かに壊れるので厳しめに倒す */
export function needsQuoting(value: string): boolean {
  if (value === '') return true
  if (value !== value.trim()) return true // 先頭・末尾の空白
  if (/[\n\r\t]/.test(value)) return true
  if (/:(\s|$)/.test(value)) return true // `key: value` と誤読される
  if (/\s#/.test(value)) return true // コメント開始と誤読される
  if (/^[-?:,[\]{}#&*!|>'"%@`]/.test(value)) return true // YAML の特殊記号始まり
  if (/^(true|false|null|yes|no|on|off|~)$/i.test(value)) return true // 真偽値・null と誤読される
  if (/^[+-]?(\d[\d_]*)(\.\d*)?([eE][+-]?\d+)?$/.test(value)) return true // 数値と誤読される
  if (value.includes('\\')) return true // バックスラッシュはエスケープして持つ
  return false
}

export function quoteValue(value: string): string {
  const escaped = value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t')
  return `"${escaped}"`
}

export function unquoteValue(raw: string): string {
  const value = raw.trim()
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
    return unescapeDoubleQuoted(value.slice(1, -1))
  }
  if (value.length >= 2 && value.startsWith("'") && value.endsWith("'")) {
    // 手で編集された場合に備えて単一引用符も読めるようにしておく
    return value.slice(1, -1).replace(/''/g, "'")
  }
  return value
}

/**
 * エスケープを 1 文字ずつ左から解く。
 * `.replace()` を連鎖させると `\\n`（バックスラッシュ + n の literal）が
 * 改行に化けるので、逐次スキャンにしている。
 */
function unescapeDoubleQuoted(input: string): string {
  let result = ''
  for (let i = 0; i < input.length; i += 1) {
    const char = input[i]
    if (char !== '\\') {
      result += char
      continue
    }
    const next = input[i + 1]
    i += 1
    switch (next) {
      case 'n':
        result += '\n'
        break
      case 'r':
        result += '\r'
        break
      case 't':
        result += '\t'
        break
      case '"':
        result += '"'
        break
      case '\\':
        result += '\\'
        break
      default:
        // 知らないエスケープはそのまま残す（データを失わない側に倒す）
        result += '\\'
        if (next !== undefined) result += next
    }
  }
  return result
}

export function formatYamlLine(key: string, value: string): string {
  return `${key}: ${needsQuoting(value) ? quoteValue(value) : value}`
}

/**
 * YAML ブロックを key → value にする。
 * 値にコロンが入りうるので **最初のコロンだけ**で分割する。
 */
export function parseYamlBlock(block: string): Record<string, string> {
  const result: Record<string, string> = {}
  for (const line of block.split(/\r?\n/)) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue
    const match = line.match(/^([A-Za-z][A-Za-z0-9_]*)\s*:\s*([\s\S]*)$/)
    if (!match) continue
    const [, key, rawValue] = match
    if (!key) continue
    result[key] = unquoteValue(rawValue ?? '')
  }
  return result
}
