import type { Card } from './card/types'

/**
 * 一覧の並べ替え。値に「項目＋向き」を持たせて 1 つの選択で決まるようにする
 * （項目と昇順・降順を別々に選ばせると、操作が 2 手に増えるわりに得るものが無い）。
 */
export type CardSortKey = 'met-desc' | 'met-asc' | 'place' | 'company' | 'name'

export const DEFAULT_SORT: CardSortKey = 'met-desc'

export const CARD_SORT_OPTIONS: { value: CardSortKey; label: string }[] = [
  { value: 'met-desc', label: '出会った日（新しい順）' },
  { value: 'met-asc', label: '出会った日（古い順）' },
  { value: 'place', label: '出会った場所' },
  { value: 'company', label: '会社名' },
  { value: 'name', label: '氏名（ふりがな順）' },
]

export function isCardSortKey(value: string): value is CardSortKey {
  return CARD_SORT_OPTIONS.some((option) => option.value === value)
}

// Intl.Collator は生成が重い。比較のたびに localeCompare を呼ぶと 500 件で効いてくる
const collator = new Intl.Collator('ja')

/** 並べ替えに使う値。氏名は漢字だと読み順にならないので、ふりがなを優先する */
function sortValue(card: Card, key: CardSortKey): string {
  switch (key) {
    case 'met-desc':
    case 'met-asc':
      return card.metOn
    case 'place':
      return card.metAt
    case 'company':
      return card.company
    case 'name':
      return card.nameKana || card.name
  }
}

/**
 * 空欄は**どの向きでも末尾**に置く。昇順で空が先頭に固まると、
 * 「会社名で並べた」のに最初の画面が空欄だらけになって並べ替えた意味が消える。
 */
function compareValues(a: string, b: string, descending: boolean): number {
  if (!a && !b) return 0
  if (!a) return 1
  if (!b) return -1
  const order = collator.compare(a, b)
  return descending ? -order : order
}

/**
 * 絞り込んだあとの一覧を並べ替える。
 * 同値は Issue 番号の新しい順で必ず決着させる（描画のたびに順序が揺れないように）。
 */
export function sortCardsBy(cards: readonly Card[], key: CardSortKey): Card[] {
  const descending = key === 'met-desc'
  return [...cards].sort((a, b) => {
    const order = compareValues(sortValue(a, key), sortValue(b, key), descending)
    return order !== 0 ? order : b.number - a.number
  })
}
