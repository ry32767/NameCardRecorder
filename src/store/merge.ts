import type { Card } from '../lib/card/types'

/**
 * キャッシュ済みの一覧に差分をマージする。
 * IndexedDB から切り離した純関数にして、ここだけはユニットテストできるようにしている。
 *
 * - 同じ Issue 番号は新しい方（updated_at が後）で置き換える
 * - 並び順は「出会った日 → Issue 番号」の降順。登録直後の 1 件が先頭に来る
 */
export function mergeCards(cached: readonly Card[], incoming: readonly Card[]): Card[] {
  const byNumber = new Map<number, Card>()
  for (const card of cached) byNumber.set(card.number, card)

  for (const card of incoming) {
    const existing = byNumber.get(card.number)
    if (!existing || card.updatedAt >= existing.updatedAt) {
      byNumber.set(card.number, card)
    }
  }

  return sortCards([...byNumber.values()])
}

export function sortCards(cards: readonly Card[]): Card[] {
  return [...cards].sort((a, b) => {
    if (a.metOn !== b.metOn) return a.metOn < b.metOn ? 1 : -1
    return b.number - a.number
  })
}

/** 一覧に出すのは open のみ。closed はアーカイブ扱い（docs/architecture.md） */
export function visibleCards(cards: readonly Card[]): Card[] {
  return cards.filter((card) => card.state === 'open')
}
