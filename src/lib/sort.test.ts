import { describe, expect, it } from 'vitest'
import { CARD_SORT_OPTIONS, DEFAULT_SORT, isCardSortKey, sortCardsBy } from './sort'
import { emptyCardFields } from './card/types'
import type { Card } from './card/types'

/** 架空の人物・会社だけで組む（AGENTS.md の Do NOT） */
function card(number: number, fields: Partial<Card>): Card {
  return {
    ...emptyCardFields(),
    number,
    state: 'open',
    htmlUrl: `https://example.com/${number}`,
    createdAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-09-01T00:00:00Z',
    ...fields,
  }
}

const CARDS: Card[] = [
  card(1, { name: '山田 太郎', nameKana: 'やまだ たろう', company: '株式会社サンプル', metOn: '2026-05-01', metAt: '展示会' }),
  card(2, { name: '佐藤 花子', nameKana: 'さとう はなこ', company: '合同会社テスト', metOn: '2026-07-10', metAt: '交流会' }),
  card(3, { name: '鈴木 一郎', nameKana: 'すずき いちろう', company: '有限会社ダミー', metOn: '2026-03-20', metAt: '' }),
]

const numbers = (cards: readonly Card[]) => cards.map((c) => c.number)

describe('sortCardsBy', () => {
  it('既定は出会った日の新しい順', () => {
    expect(DEFAULT_SORT).toBe('met-desc')
    expect(numbers(sortCardsBy(CARDS, 'met-desc'))).toEqual([2, 1, 3])
  })

  it('出会った日の古い順にも並べ替えられる', () => {
    expect(numbers(sortCardsBy(CARDS, 'met-asc'))).toEqual([3, 1, 2])
  })

  it('出会った場所で並べ替えられる', () => {
    // こ（交流会）→ て（展示会）。場所が空の 3 は末尾
    expect(numbers(sortCardsBy(CARDS, 'place'))).toEqual([2, 1, 3])
  })

  it('会社名で並べ替えられる', () => {
    // か（株式会社）→ ご（合同会社）→ ゆ（有限会社）
    expect(numbers(sortCardsBy(CARDS, 'company'))).toEqual([1, 2, 3])
  })

  it('氏名はふりがなの順に並べる', () => {
    // さとう → すずき → やまだ（漢字の並びとは一致しない）
    expect(numbers(sortCardsBy(CARDS, 'name'))).toEqual([2, 3, 1])
  })

  it('ふりがなが無ければ氏名で並べる', () => {
    const list = [card(1, { name: 'あべ' }), card(2, { name: 'いとう' })]
    expect(numbers(sortCardsBy(list, 'name'))).toEqual([1, 2])
  })

  it('空欄は昇順でも降順でも末尾に置く', () => {
    const list = [card(1, { metOn: '' }), card(2, { metOn: '2026-01-01' })]
    expect(numbers(sortCardsBy(list, 'met-desc'))).toEqual([2, 1])
    expect(numbers(sortCardsBy(list, 'met-asc'))).toEqual([2, 1])
  })

  it('同じ値なら Issue 番号の新しい順で決着する', () => {
    const list = [
      card(5, { metOn: '2026-04-01' }),
      card(9, { metOn: '2026-04-01' }),
      card(7, { metOn: '2026-04-01' }),
    ]
    expect(numbers(sortCardsBy(list, 'met-desc'))).toEqual([9, 7, 5])
    expect(numbers(sortCardsBy(list, 'met-asc'))).toEqual([9, 7, 5])
  })

  it('元の配列を書き換えない', () => {
    const before = numbers(CARDS)
    sortCardsBy(CARDS, 'name')
    expect(numbers(CARDS)).toEqual(before)
  })
})

describe('isCardSortKey', () => {
  it('選択肢の値だけを受け付ける', () => {
    for (const option of CARD_SORT_OPTIONS) {
      expect(isCardSortKey(option.value)).toBe(true)
    }
    expect(isCardSortKey('unknown')).toBe(false)
  })
})
