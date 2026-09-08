import type { Card } from './card/types'

/**
 * 検索用の正規化。
 * - NFKC で全角英数・半角カナのゆれを吸収する
 * - カタカナをひらがなに寄せる（「やまだ」で「ヤマダ」にも当たるようにする）
 * - 小文字に揃える（大文字小文字を区別しない）
 */
export function normalizeForSearch(value: string): string {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[ァ-ヶ]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0x60))
    .replace(/[ー]/g, 'ー')
    .replace(/\s+/g, ' ')
    .trim()
}

/** 検索対象は 氏名・ふりがな・会社名・部署・メモ（docs/spec.md 機能3） */
const SEARCH_FIELDS = ['name', 'nameKana', 'company', 'department', 'memo'] as const

export interface IndexedCard {
  card: Card
  haystack: string
}

/**
 * 検索用の文字列をカードごとに 1 回だけ作る。
 * キー入力のたびに正規化すると 500 件で目に見えて遅くなるため、
 * 正規化はキャッシュ読み込み時に済ませておく（docs/spec.md 非機能要件）。
 */
export function buildSearchIndex(cards: readonly Card[]): IndexedCard[] {
  return cards.map((card) => ({
    card,
    haystack: normalizeForSearch(SEARCH_FIELDS.map((field) => card[field]).join(' ')),
  }))
}

export interface CardFilter {
  query?: string
  company?: string
  event?: string
  tag?: string
}

export function isFilterActive(filter: CardFilter): boolean {
  return Boolean(filter.query?.trim() || filter.company || filter.event || filter.tag)
}

export const EMPTY_FILTER: CardFilter = {}

/** 絞り込み（会社・イベント・タグ）と検索は同時に効く */
export function filterCards(index: readonly IndexedCard[], filter: CardFilter): Card[] {
  const query = normalizeForSearch(filter.query ?? '')
  const terms = query ? query.split(' ').filter(Boolean) : []

  return index
    .filter(({ card, haystack }) => {
      if (filter.company && card.company !== filter.company) return false
      if (filter.event && card.metAt !== filter.event) return false
      if (filter.tag && !card.tags.includes(filter.tag)) return false
      // 複数語はすべて含む（AND）
      return terms.every((term) => haystack.includes(term))
    })
    .map(({ card }) => card)
}

export interface FacetOption {
  value: string
  count: number
}

/** 絞り込みに出す選択肢。値は YAML を正とする（ラベルは冗長化にすぎない） */
export function collectFacets(cards: readonly Card[]): {
  companies: FacetOption[]
  events: FacetOption[]
  tags: FacetOption[]
} {
  return {
    companies: countValues(cards.map((card) => [card.company])),
    events: countValues(cards.map((card) => [card.metAt])),
    tags: countValues(cards.map((card) => card.tags)),
  }
}

function countValues(groups: readonly (readonly string[])[]): FacetOption[] {
  const counts = new Map<string, number>()
  for (const group of groups) {
    for (const raw of group) {
      const value = raw.trim()
      if (!value) continue
      counts.set(value, (counts.get(value) ?? 0) + 1)
    }
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value, 'ja'))
}
