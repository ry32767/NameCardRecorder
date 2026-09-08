import { describe, expect, it, vi } from 'vitest'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TEST_SETTINGS, renderWithProviders } from '../test/render'
import { CardList } from './CardList'
import { OFFLINE_MESSAGE } from '../store/useCards'
import { emptyCardFields } from '../lib/card/types'
import type { Card } from '../lib/card/types'
import type { CardsState, SyncState } from '../store/useCards'

// 架空の名刺のみ（AGENTS.md の Do NOT）
function card(overrides: Partial<Card>): Card {
  return {
    ...emptyCardFields(),
    number: 1,
    state: 'open',
    htmlUrl: 'https://github.com/sample-user/namecard-data/issues/1',
    createdAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-09-01T00:00:00Z',
    metOn: '2026-09-01',
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
    title: '課長',
    metOn: '2026-09-08',
    metAt: '展示会2026',
    tags: ['要フォロー'],
  }),
  card({
    number: 2,
    name: '佐藤 花子',
    nameKana: 'サトウ ハナコ',
    company: '有限会社テスト',
    metOn: '2026-09-05',
  }),
  card({ number: 3, name: 'John Sample', company: 'Sample Inc.', metOn: '2026-09-01' }),
]

function state(overrides: Partial<CardsState> = {}): CardsState {
  return {
    cards,
    loaded: true,
    syncState: 'synced' as SyncState,
    errorMessage: null,
    refresh: vi.fn(),
    addCard: vi.fn(),
    ...overrides,
  }
}

function renderList(overrides: Partial<CardsState> = {}) {
  return renderWithProviders(<CardList cards={state(overrides)} />, { settings: TEST_SETTINGS })
}

describe('一覧 / 表示', () => {
  it('氏名・会社名・部署役職・出会った日をカードで表示する', () => {
    renderList()
    // 会社名は絞り込みボタンにも出るので、一覧の中だけを見る
    const list = within(screen.getByRole('list'))
    expect(list.getByText('山田 太郎')).toBeInTheDocument()
    expect(list.getByText('株式会社サンプル')).toBeInTheDocument()
    expect(list.getByText('営業本部 課長')).toBeInTheDocument()
    expect(list.getByText('2026-09-08')).toBeInTheDocument()
  })

  it('カードから詳細画面へのリンクになっている', () => {
    renderList()
    expect(screen.getByRole('link', { name: /山田 太郎/ })).toHaveAttribute(
      'href',
      '/cards/1',
    )
  })

  it('1 件も無いときは案内を出す', () => {
    renderList({ cards: [] })
    expect(
      screen.getByText('まだ名刺がありません。「+ 名刺を追加」から登録しましょう'),
    ).toBeInTheDocument()
  })

  it('closed（アーカイブ）は一覧に出さない', () => {
    renderList({ cards: [card({ number: 9, name: '退職 済', state: 'closed' })] })
    expect(screen.queryByText('退職 済')).not.toBeInTheDocument()
  })

  it('オフラインのときは最新でない可能性を伝える', () => {
    renderList({ syncState: 'offline', errorMessage: OFFLINE_MESSAGE })
    expect(screen.getByText(OFFLINE_MESSAGE)).toBeInTheDocument()
    // オフラインでも一覧自体は見える
    expect(screen.getByText('山田 太郎')).toBeInTheDocument()
  })
})

describe('一覧 / 検索', () => {
  it('氏名で絞り込める', async () => {
    renderList()
    const user = userEvent.setup()
    await user.type(screen.getByPlaceholderText(/検索/), '山田')

    expect(screen.getByText('山田 太郎')).toBeInTheDocument()
    expect(screen.queryByText('佐藤 花子')).not.toBeInTheDocument()
  })

  it('大文字小文字を区別しない', async () => {
    renderList()
    const user = userEvent.setup()
    await user.type(screen.getByPlaceholderText(/検索/), 'SAMPLE')
    expect(screen.getByText('John Sample')).toBeInTheDocument()
  })

  it('ひらがなでふりがなにヒットする', async () => {
    renderList()
    const user = userEvent.setup()
    await user.type(screen.getByPlaceholderText(/検索/), 'やまだ')
    expect(screen.getByText('山田 太郎')).toBeInTheDocument()
  })

  it('0 件のときは該当なしを出す', async () => {
    renderList()
    const user = userEvent.setup()
    await user.type(screen.getByPlaceholderText(/検索/), '存在しない名前')
    expect(screen.getByText('該当する名刺がありません')).toBeInTheDocument()
  })
})

describe('一覧 / 絞り込み', () => {
  it('会社ラベルで絞り込める', async () => {
    renderList()
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /株式会社サンプル/ }))

    expect(screen.getByText('山田 太郎')).toBeInTheDocument()
    expect(screen.queryByText('佐藤 花子')).not.toBeInTheDocument()
  })

  it('タグで絞り込める', async () => {
    renderList()
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /要フォロー/ }))
    expect(screen.getByText('山田 太郎')).toBeInTheDocument()
  })

  it('絞り込みと検索が同時に効く', async () => {
    renderList()
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /展示会2026/ }))
    await user.type(screen.getByPlaceholderText(/検索/), '佐藤')

    expect(screen.getByText('該当する名刺がありません')).toBeInTheDocument()
  })

  it('絞り込みをクリアできる', async () => {
    renderList()
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: /有限会社テスト/ }))
    expect(screen.queryByText('山田 太郎')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '絞り込みをクリア' }))
    expect(screen.getByText('山田 太郎')).toBeInTheDocument()
  })

  it('絞り込みが無いときはクリアボタンを出さない', () => {
    renderList()
    expect(screen.queryByRole('button', { name: '絞り込みをクリア' })).not.toBeInTheDocument()
  })
})

describe('一覧 / 並べ替え', () => {
  /** 一覧に並んでいる氏名を、表示されている順に取る */
  function shownNames() {
    return within(screen.getByRole('list'))
      .getAllByRole('listitem')
      .map((item) => item.textContent ?? '')
      .map((text) => text.replace(/\s+/g, ' ').trim())
  }

  function order() {
    return shownNames().map((text) =>
      ['山田 太郎', '佐藤 花子', 'John Sample'].find((name) => text.includes(name)),
    )
  }

  it('既定は出会った日の新しい順', () => {
    renderList()
    expect(screen.getByLabelText('並び順')).toHaveValue('met-desc')
    expect(order()).toEqual(['山田 太郎', '佐藤 花子', 'John Sample'])
  })

  it('出会った日の古い順に並べ替えられる', async () => {
    renderList()
    const user = userEvent.setup()
    await user.selectOptions(screen.getByLabelText('並び順'), 'met-asc')
    expect(order()).toEqual(['John Sample', '佐藤 花子', '山田 太郎'])
  })

  it('氏名はふりがなの順に並べ替えられる', async () => {
    renderList()
    const user = userEvent.setup()
    // 日本語ロケールでは英字が先。ふりがなの無い John Sample は氏名で並ぶ
    await user.selectOptions(screen.getByLabelText('並び順'), 'name')
    expect(order()).toEqual(['John Sample', '佐藤 花子', '山田 太郎'])
  })

  it('出会った場所で並べ替えられる（場所が無いものは末尾）', async () => {
    renderList()
    const user = userEvent.setup()
    await user.selectOptions(screen.getByLabelText('並び順'), 'place')
    expect(order()[0]).toBe('山田 太郎')
  })

  it('並べ替えは絞り込みの結果の中で効く', async () => {
    renderList()
    const user = userEvent.setup()

    await user.selectOptions(screen.getByLabelText('並び順'), 'met-asc')
    await user.type(screen.getByPlaceholderText(/検索/), 'さ')

    // 「さ」に当たるのは 佐藤（さとう）と 山田（会社名のサンプル）
    expect(order()).toEqual(['佐藤 花子', '山田 太郎'])
  })

  it('並べ替えを変えても絞り込みは外れない', async () => {
    renderList()
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: /株式会社サンプル/ }))
    await user.selectOptions(screen.getByLabelText('並び順'), 'company')

    expect(order()).toEqual(['山田 太郎'])
    expect(screen.getByRole('button', { name: '絞り込みをクリア' })).toBeInTheDocument()
  })
})
