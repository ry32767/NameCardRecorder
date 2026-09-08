import { describe, expect, it } from 'vitest'
import { buildSearchIndex, collectFacets, filterCards, normalizeForSearch } from './search'
import { emptyCardFields } from './card/types'
import type { Card } from './card/types'

// 架空の人物・会社のみ（AGENTS.md の Do NOT）
function card(overrides: Partial<Card> = {}): Card {
  return {
    ...emptyCardFields(),
    number: 1,
    state: 'open',
    htmlUrl: 'https://github.com/sample-user/namecard-data/issues/1',
    createdAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-09-01T00:00:00Z',
    ...overrides,
  }
}

const cards: Card[] = [
  card({
    number: 1,
    name: '山田 太郎',
    nameKana: 'やまだ たろう',
    company: '株式会社サンプル',
    department: '営業本部',
    metAt: '展示会2026',
    tags: ['要フォロー'],
    memo: '新製品の件',
  }),
  card({
    number: 2,
    name: '佐藤 花子',
    nameKana: 'サトウ ハナコ',
    company: '有限会社テスト',
    department: '技術部',
    metAt: '社内紹介',
    tags: ['要フォロー', '技術'],
  }),
  card({
    number: 3,
    name: 'John Sample',
    company: 'Sample Inc.',
    department: 'Sales',
    memo: 'met at SAMPLE conference',
  }),
]

const index = buildSearchIndex(cards)

function numbersOf(query: string) {
  return filterCards(index, { query }).map((c) => c.number)
}

describe('normalizeForSearch', () => {
  it('カタカナをひらがなに寄せる', () => {
    expect(normalizeForSearch('ヤマダ')).toBe('やまだ')
  })

  it('小文字に揃える', () => {
    expect(normalizeForSearch('SAMPLE')).toBe('sample')
  })

  it('全角英数を半角にする', () => {
    expect(normalizeForSearch('ＳＡＭＰＬＥ１２３')).toBe('sample123')
  })
})

describe('filterCards / 検索', () => {
  it('氏名で絞り込める', () => {
    expect(numbersOf('山田')).toEqual([1])
  })

  it('会社名で絞り込める', () => {
    expect(numbersOf('サンプル')).toEqual([1])
  })

  it('部署で絞り込める', () => {
    expect(numbersOf('技術部')).toEqual([2])
  })

  it('メモで絞り込める', () => {
    expect(numbersOf('新製品')).toEqual([1])
  })

  it('大文字小文字を区別しない（SAMPLE で sample にヒットする）', () => {
    expect(numbersOf('SAMPLE')).toEqual([3])
    expect(numbersOf('sample')).toEqual([3])
  })

  it('ひらがなで検索するとふりがなにヒットする', () => {
    expect(numbersOf('やまだ')).toEqual([1])
  })

  it('ひらがなでカタカナのふりがなにもヒットする', () => {
    expect(numbersOf('さとう')).toEqual([2])
  })

  it('該当が無ければ空になる', () => {
    expect(numbersOf('存在しない会社')).toEqual([])
  })

  it('空の検索語ではすべて返る', () => {
    expect(numbersOf('')).toEqual([1, 2, 3])
    expect(numbersOf('   ')).toEqual([1, 2, 3])
  })

  it('複数語はすべて含むものだけ返す', () => {
    expect(numbersOf('山田 サンプル')).toEqual([1])
    expect(numbersOf('山田 テスト')).toEqual([])
  })

  it('メール・電話は検索対象に含めない', () => {
    const withEmail = buildSearchIndex([card({ number: 9, email: 'secret@example.com' })])
    expect(filterCards(withEmail, { query: 'secret' })).toEqual([])
  })
})

describe('filterCards / ラベル絞り込み', () => {
  it('会社で絞り込める', () => {
    expect(filterCards(index, { company: '株式会社サンプル' }).map((c) => c.number)).toEqual([1])
  })

  it('イベントで絞り込める', () => {
    expect(filterCards(index, { event: '展示会2026' }).map((c) => c.number)).toEqual([1])
  })

  it('タグで絞り込める', () => {
    expect(filterCards(index, { tag: '要フォロー' }).map((c) => c.number)).toEqual([1, 2])
  })

  it('絞り込みと検索は同時に効く', () => {
    expect(filterCards(index, { tag: '要フォロー', query: '佐藤' }).map((c) => c.number)).toEqual([
      2,
    ])
  })

  it('絞り込んだ結果に無いものは検索でも出ない', () => {
    expect(filterCards(index, { company: '有限会社テスト', query: '山田' })).toEqual([])
  })
})

describe('collectFacets', () => {
  it('会社・イベント・タグを件数つきで集める', () => {
    const facets = collectFacets(cards)
    expect(facets.companies.map((f) => f.value)).toContain('株式会社サンプル')
    expect(facets.events.map((f) => f.value)).toContain('展示会2026')
    expect(facets.tags[0]).toEqual({ value: '要フォロー', count: 2 })
  })

  it('空の値は選択肢に出さない', () => {
    const facets = collectFacets([card({ company: '', metAt: '', tags: [] })])
    expect(facets.companies).toEqual([])
    expect(facets.events).toEqual([])
    expect(facets.tags).toEqual([])
  })
})

describe('性能', () => {
  // docs/spec.md: 500 件で検索文字入力から結果表示までが 1 秒以内
  it('500 件の検索が 1 秒以内に終わる', () => {
    const many = Array.from({ length: 500 }, (_, i) =>
      card({
        number: i + 1,
        name: `サンプル 太郎${i}`,
        nameKana: `さんぷる たろう${i}`,
        company: `株式会社サンプル${i % 50}`,
        department: `第${i % 10}営業部`,
        memo: `${i} 件目のメモ`,
      }),
    )
    const manyIndex = buildSearchIndex(many)

    const start = performance.now()
    // 1 文字ずつ打った場合を模して複数回まわす
    for (const query of ['さ', 'さん', 'さんぷ', 'さんぷる', 'さんぷる た']) {
      filterCards(manyIndex, { query })
    }
    const elapsed = performance.now() - start

    expect(filterCards(manyIndex, { query: 'さんぷる' })).toHaveLength(500)
    expect(elapsed).toBeLessThan(1000)
  })

  it('500 件のインデックス構築が 1 秒以内に終わる', () => {
    const many = Array.from({ length: 500 }, (_, i) => card({ number: i + 1, name: `氏名${i}` }))
    const start = performance.now()
    buildSearchIndex(many)
    expect(performance.now() - start).toBeLessThan(1000)
  })
})
