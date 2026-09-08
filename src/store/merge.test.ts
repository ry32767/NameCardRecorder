import { describe, expect, it } from 'vitest'
import { mergeCards, sortCards, visibleCards } from './merge'
import { emptyCardFields } from '../lib/card/types'
import type { Card } from '../lib/card/types'

function card(number: number, overrides: Partial<Card> = {}): Card {
  return {
    ...emptyCardFields(),
    number,
    state: 'open',
    htmlUrl: `https://github.com/sample-user/namecard-data/issues/${number}`,
    createdAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-09-01T00:00:00Z',
    metOn: '2026-09-01',
    ...overrides,
  }
}

describe('mergeCards', () => {
  it('新しく取得した内容で同じ番号を置き換える', () => {
    const cached = [card(1, { name: '旧', updatedAt: '2026-09-01T00:00:00Z' })]
    const incoming = [card(1, { name: '新', updatedAt: '2026-09-02T00:00:00Z' })]
    expect(mergeCards(cached, incoming)[0]?.name).toBe('新')
  })

  it('取得した方が古ければキャッシュを残す', () => {
    const cached = [card(1, { name: '新', updatedAt: '2026-09-05T00:00:00Z' })]
    const incoming = [card(1, { name: '古', updatedAt: '2026-09-01T00:00:00Z' })]
    expect(mergeCards(cached, incoming)[0]?.name).toBe('新')
  })

  it('キャッシュに無い分は足す', () => {
    const merged = mergeCards([card(1)], [card(2)])
    expect(merged.map((c) => c.number).sort()).toEqual([1, 2])
  })

  // docs/spec.md 機能2:「いま登録した名刺が一覧の先頭に表示される」
  it('いま登録した名刺（出会った日が今日）が先頭に来る', () => {
    const cached = [
      card(1, { metOn: '2026-09-01' }),
      card(2, { metOn: '2026-08-20' }),
      card(3, { metOn: '2026-09-05' }),
    ]
    const justCreated = card(4, { metOn: '2026-09-08', name: '登録直後' })

    expect(mergeCards(cached, [justCreated])[0]?.name).toBe('登録直後')
  })

  it('同じ日なら新しい Issue 番号が先に来る', () => {
    const sorted = sortCards([
      card(1, { metOn: '2026-09-08' }),
      card(9, { metOn: '2026-09-08' }),
      card(5, { metOn: '2026-09-08' }),
    ])
    expect(sorted.map((c) => c.number)).toEqual([9, 5, 1])
  })

  it('出会った日の降順に並べる', () => {
    const sorted = sortCards([
      card(1, { metOn: '2026-08-01' }),
      card(2, { metOn: '2026-09-08' }),
      card(3, { metOn: '2026-09-01' }),
    ])
    expect(sorted.map((c) => c.metOn)).toEqual(['2026-09-08', '2026-09-01', '2026-08-01'])
  })

  it('出会った日が空でも落ちない', () => {
    expect(() => sortCards([card(1, { metOn: '' }), card(2)])).not.toThrow()
  })
})

describe('visibleCards', () => {
  it('closed（アーカイブ）を除く', () => {
    const result = visibleCards([card(1), card(2, { state: 'closed' })])
    expect(result.map((c) => c.number)).toEqual([1])
  })
})
