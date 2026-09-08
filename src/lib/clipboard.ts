/**
 * クリップボードへコピーする。**成功したかを返す**。
 *
 * Clipboard API は HTTPS でないと使えず、権限や UA によっては reject する。
 * 呼び出し側が「コピーできなかった」を presentation で救えるよう、
 * 例外を投げずに false を返す設計にしている（黙って失敗させない）。
 */
export async function copyText(text: string): Promise<boolean> {
  if (!text) return false
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // 権限拒否・非セキュアコンテキストなど。呼び出し側が手動コピーに誘導する
  }
  return false
}
