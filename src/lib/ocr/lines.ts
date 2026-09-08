/**
 * OCR が返した行を、そのまま貼れる形に整える。
 *
 * Tesseract は日本語で**文字と文字の間に空白を入れてくる**
 * （実測: `株式会社サンプル` → `株 式 会 社 サ ンプ ル`）。
 * この状態でコピーできても貼り先で直す羽目になり、行コピーの意味が薄れる。
 *
 * ただし `山田 太郎` の姓名の区切りのような**意味のある空白は消してはいけない**。
 * そこで「1 文字だけのトークンが多数を占める行」＝ばらけた誤検出とみなして詰め、
 * それ以外はそのまま残す。
 */

/** CJK（漢字・ひらがな・カタカナ）と、日本語組版で使う記号だけでできているか */
const CJK_ONLY = /^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー・々〆〇]+$/u

export function normalizeOcrLine(line: string): string {
  // JS の \s は全角空白 (U+3000) も含むので、これだけで名刺の空白は拾える
  const collapsed = line.replace(/\s+/g, ' ').trim()
  if (!collapsed) return ''

  const tokens = collapsed.split(' ')
  if (tokens.length < 2) return collapsed

  // 1 つでも CJK 以外が混ざる行は触らない（`TEL 03-1234-5678` の空白は意味がある）
  if (!tokens.every((token) => CJK_ONLY.test(token))) return collapsed

  const singles = tokens.filter((token) => token.length === 1).length
  // 過半数が 1 文字なら、文字単位にばらけた誤検出とみなして詰める
  return singles * 2 > tokens.length ? tokens.join('') : collapsed
}

/** 空行を落としつつ整える */
export function normalizeOcrLines(lines: readonly { text: string }[]): string[] {
  return lines.map((line) => normalizeOcrLine(line.text)).filter((text) => text.length > 0)
}
