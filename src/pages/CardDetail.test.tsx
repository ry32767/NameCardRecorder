import { describe, expect, it, vi } from 'vitest'
import { screen, within } from '@testing-library/react'
import { Route, Routes } from 'react-router-dom'
import { TEST_SETTINGS, renderWithProviders } from '../test/render'
import { CardDetail } from './CardDetail'
import { emptyCardFields } from '../lib/card/types'
import type { Card } from '../lib/card/types'
import type { CardsState } from '../store/useCards'

const sample: Card = {
  ...emptyCardFields(),
  number: 12,
  state: 'open',
  htmlUrl: 'https://github.com/sample-user/namecard-data/issues/12',
  createdAt: '2026-09-08T00:00:00Z',
  updatedAt: '2026-09-08T00:00:00Z',
  name: '山田 太郎',
  nameKana: 'やまだ たろう',
  company: '株式会社サンプル',
  department: '営業本部 第一営業部',
  title: '課長',
  email: 'taro.yamada@example.co.jp',
  phone: '03-1234-5678',
  mobile: '090-1234-5678',
  fax: '03-1234-5679',
  postalCode: '100-0001',
  address: '東京都千代田区千代田1-1-1 サンプルビル 8F',
  website: 'https://example.co.jp',
  metOn: '2026-09-08',
  metAt: '東京ビッグサイト / 展示会2026',
  tags: ['要フォロー'],
  memo: '新製品の件で再連絡する。',
}

function state(cards: Card[]): CardsState {
  return {
    cards,
    loaded: true,
    syncState: 'synced',
    errorMessage: null,
    refresh: vi.fn(),
    addCard: vi.fn(),
  }
}

function renderDetail(cards: Card[], route = '/cards/12') {
  return renderWithProviders(
    <Routes>
      <Route path="/cards/:number" element={<CardDetail cards={state(cards)} />} />
    </Routes>,
    { settings: TEST_SETTINGS, route },
  )
}

describe('詳細画面', () => {
  it('全フィールドを表示する', () => {
    renderDetail([sample])
    for (const value of [
      '株式会社サンプル',
      'やまだ たろう',
      '営業本部 第一営業部 課長',
      'taro.yamada@example.co.jp',
      '03-1234-5678',
      '090-1234-5678',
      '03-1234-5679',
      '100-0001',
      '東京都千代田区千代田1-1-1 サンプルビル 8F',
      '2026-09-08',
      '東京ビッグサイト / 展示会2026',
      '要フォロー',
      '新製品の件で再連絡する。',
    ]) {
      expect(screen.getByText(value)).toBeInTheDocument()
    }
    expect(screen.getAllByText('山田 太郎').length).toBeGreaterThan(0)
  })

  it('メールが mailto: リンクになっている', () => {
    renderDetail([sample])
    expect(screen.getByRole('link', { name: 'taro.yamada@example.co.jp' })).toHaveAttribute(
      'href',
      'mailto:taro.yamada@example.co.jp',
    )
  })

  it('電話と携帯が tel: リンクになっている', () => {
    renderDetail([sample])
    expect(screen.getByRole('link', { name: '03-1234-5678' })).toHaveAttribute(
      'href',
      'tel:03-1234-5678',
    )
    expect(screen.getByRole('link', { name: '090-1234-5678' })).toHaveAttribute(
      'href',
      'tel:090-1234-5678',
    )
  })

  it('FAX は発信リンクにしない', () => {
    renderDetail([sample])
    expect(screen.queryByRole('link', { name: '03-1234-5679' })).not.toBeInTheDocument()
  })

  it('GitHub で開くリンクが該当 Issue を指す', () => {
    renderDetail([sample])
    expect(screen.getByRole('link', { name: /GitHub で開く/ })).toHaveAttribute(
      'href',
      'https://github.com/sample-user/namecard-data/issues/12',
    )
  })

  it('スキーム無しの Web サイトにも https を補う', () => {
    renderDetail([{ ...sample, website: 'www.example.com' }])
    expect(screen.getByRole('link', { name: 'www.example.com' })).toHaveAttribute(
      'href',
      'https://www.example.com',
    )
  })

  it('空のフィールドは行ごと出さない', () => {
    renderDetail([{ ...sample, fax: '', memo: '' }])
    expect(screen.queryByText('FAX')).not.toBeInTheDocument()
    expect(screen.queryByText('メモ')).not.toBeInTheDocument()
  })

  it('存在しない Issue 番号なら 名刺が見つかりません と出て一覧に戻れる', () => {
    renderDetail([sample], '/cards/999')
    expect(screen.getByText('名刺が見つかりません')).toBeInTheDocument()
    // ヘッダの戻る導線とは別に、本文からも一覧に戻れる
    expect(
      within(screen.getByRole('main')).getByRole('link', { name: '一覧に戻る' }),
    ).toHaveAttribute('href', '/')
  })
})
