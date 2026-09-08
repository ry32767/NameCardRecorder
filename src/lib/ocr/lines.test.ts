import { describe, expect, it } from 'vitest'
import { normalizeOcrLine, normalizeOcrLines } from './lines'

describe('normalizeOcrLine', () => {
  // 実際に架空の名刺を読ませて出た形（開発サーバで実測）
  it('文字単位にばらけた日本語を詰める', () => {
    expect(normalizeOcrLine('株 式 会 社 サ ンプ ル')).toBe('株式会社サンプル')
    expect(normalizeOcrLine('営業 本 部 第 一 営業 部')).toBe('営業本部第一営業部')
  })

  it('姓名の区切りの空白は残す', () => {
    expect(normalizeOcrLine('山田 太郎')).toBe('山田 太郎')
    expect(normalizeOcrLine('やまだ たろう')).toBe('やまだ たろう')
    expect(normalizeOcrLine('スズキ イチロウ')).toBe('スズキ イチロウ')
  })

  it('英数字が混ざる行の空白は触らない', () => {
    expect(normalizeOcrLine('TEL 03-1234-5678')).toBe('TEL 03-1234-5678')
    expect(normalizeOcrLine('Sample Inc.')).toBe('Sample Inc.')
    expect(normalizeOcrLine('〒100-0001 東京都千代田区')).toBe('〒100-0001 東京都千代田区')
  })

  it('空白の無い行はそのまま返す', () => {
    expect(normalizeOcrLine('taro.yamada@example.co.jp')).toBe('taro.yamada@example.co.jp')
    expect(normalizeOcrLine('株式会社サンプル')).toBe('株式会社サンプル')
  })

  it('全角空白や連続空白をまとめる', () => {
    expect(normalizeOcrLine('  山田　　太郎  ')).toBe('山田 太郎')
  })

  it('空行・空白だけの行は空文字になる', () => {
    expect(normalizeOcrLine('')).toBe('')
    expect(normalizeOcrLine('   ')).toBe('')
  })

  it('1 文字が過半数でなければ詰めない', () => {
    // 「東京都 千代田区 1」→ 1 文字は 1/3 なので意味のある空白とみなす
    expect(normalizeOcrLine('東京都 千代田 区')).toBe('東京都 千代田 区')
  })

  it('長音符や中黒だけの行も落ちない', () => {
    expect(normalizeOcrLine('ー ・ ー')).toBe('ー・ー')
  })
})

describe('normalizeOcrLines', () => {
  it('整えつつ空行を落とす', () => {
    expect(
      normalizeOcrLines([
        { text: '株 式 会 社 サ ンプ ル' },
        { text: '   ' },
        { text: 'TEL 03-1234-5678' },
      ]),
    ).toEqual(['株式会社サンプル', 'TEL 03-1234-5678'])
  })
})
