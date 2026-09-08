import { describe, expect, it } from 'vitest'
import { parseOcrLines, parseOcrText } from './parser'
import type { OcrLine } from './types'

/**
 * 入力はすべて架空の人物・会社で合成した OCR テキスト（AGENTS.md の Do NOT）。
 * OCR の精度そのものは受け入れ条件にしない。判定するのは
 * 「印字されている情報が正しいフィールドに振り分けられるか」だけ（docs/spec.md 機能2）。
 */

const STANDARD_CARD = [
  '株式会社サンプル',
  '営業本部 第一営業部 課長',
  '山田 太郎',
  'やまだ たろう',
  '〒100-0001 東京都千代田区千代田1-1-1 サンプルビル 8F',
  'TEL 03-1234-5678  FAX 03-1234-5679',
  '携帯 090-1234-5678',
  'taro.yamada@example.co.jp',
  'https://example.co.jp',
]

describe('parseOcrText / 標準的な日本語名刺', () => {
  const fields = parseOcrText(STANDARD_CARD.join('\n'))

  it('メールアドレスを email に入れる', () => {
    expect(fields.email).toBe('taro.yamada@example.co.jp')
  })

  it('Web サイトを website に入れる', () => {
    expect(fields.website).toBe('https://example.co.jp')
  })

  it('郵便番号を postalCode に入れる', () => {
    expect(fields.postalCode).toBe('100-0001')
  })

  it('郵便番号と同じ行の続きを address に入れる', () => {
    expect(fields.address).toBe('東京都千代田区千代田1-1-1 サンプルビル 8F')
  })

  it('TEL と FAX を別々の欄に入れる', () => {
    expect(fields.phone).toBe('03-1234-5678')
    expect(fields.fax).toBe('03-1234-5679')
  })

  it('携帯番号を mobile に入れる', () => {
    expect(fields.mobile).toBe('090-1234-5678')
  })

  it('株式会社を含む行を company に入れる', () => {
    expect(fields.company).toBe('株式会社サンプル')
  })

  it('役職を title に入れる', () => {
    expect(fields.title).toBe('課長')
  })

  it('部署を department に入れる（役職を除く）', () => {
    expect(fields.department).toBe('営業本部 第一営業部')
  })

  it('かなだけの行を nameKana に入れる', () => {
    expect(fields.nameKana).toBe('やまだ たろう')
  })

  it('残った行から name を推定する', () => {
    expect(fields.name).toBe('山田 太郎')
  })
})

describe('電話番号の振り分け', () => {
  it('090 で始まる番号はラベルが無くても mobile に入る', () => {
    const fields = parseOcrText('090-1111-2222')
    expect(fields.mobile).toBe('090-1111-2222')
    expect(fields.phone).toBeUndefined()
  })

  it.each(['080-1111-2222', '070-1111-2222'])('%s も mobile に入る', (number) => {
    expect(parseOcrText(number).mobile).toBe(number)
  })

  it('TEL と FAX が別の行にあっても振り分けられる', () => {
    const fields = parseOcrText('TEL: 03-1234-5678\nFAX: 03-1234-5679')
    expect(fields.phone).toBe('03-1234-5678')
    expect(fields.fax).toBe('03-1234-5679')
  })

  it('Mobile / M. のラベルでも mobile に入る', () => {
    expect(parseOcrText('Mobile 03-1234-5678').mobile).toBe('03-1234-5678')
    expect(parseOcrText('M. 03-1234-5678').mobile).toBe('03-1234-5678')
  })

  it('ラベルの無い固定電話は phone に入る', () => {
    expect(parseOcrText('03-1234-5678').phone).toBe('03-1234-5678')
  })

  it('括弧つきの表記も読む', () => {
    expect(parseOcrText('TEL 03(1234)5678').phone).toBe('03(1234)5678')
  })

  it('郵便番号を電話番号と取り違えない', () => {
    const fields = parseOcrText('〒100-0001 東京都千代田区')
    expect(fields.postalCode).toBe('100-0001')
    expect(fields.phone).toBeUndefined()
    expect(fields.fax).toBeUndefined()
    expect(fields.mobile).toBeUndefined()
  })

  it('同じ番号が TEL と FAX の両方に入らない', () => {
    const fields = parseOcrText('TEL 03-1234-5678')
    expect(fields.phone).toBe('03-1234-5678')
    expect(fields.fax).toBeUndefined()
  })
})

describe('会社名の判定', () => {
  it.each([
    '株式会社サンプル',
    'サンプル株式会社',
    '有限会社テスト',
    '合同会社サンプル',
    '(株)サンプル',
    '㈱サンプル',
    'Sample Inc.',
    'Sample Corp.',
    'Sample Co., Ltd.',
  ])('%s を company として拾う', (line) => {
    expect(parseOcrText(line).company).toBe(line)
  })

  it('会社名が無ければ company は空のまま', () => {
    expect(parseOcrText('山田 太郎').company).toBeUndefined()
  })
})

describe('役職と部署', () => {
  it.each(['代表取締役', '取締役', '部長', '次長', '課長', '係長', '主任'])(
    '%s を title として拾う',
    (role) => {
      expect(parseOcrText(role).title).toBe(role)
    },
  )

  it.each(['Director', 'Manager', 'マネージャー'])('%s を title として拾う', (role) => {
    expect(parseOcrText(role).title).toBe(role)
  })

  it('部・課・本部・室で終わる語を department として拾う', () => {
    expect(parseOcrText('技術開発部').department).toBe('技術開発部')
    expect(parseOcrText('総務課').department).toBe('総務課')
    expect(parseOcrText('管理本部').department).toBe('管理本部')
    expect(parseOcrText('秘書室').department).toBe('秘書室')
  })

  it('部署と役職が同じ行にあれば分けて入れる', () => {
    const fields = parseOcrText('技術開発部 部長')
    expect(fields.department).toBe('技術開発部')
    expect(fields.title).toBe('部長')
  })
})

describe('抽出できなかった項目', () => {
  // 「推測で誤った値を入れない」（docs/spec.md 機能2）
  it('該当が無い項目は undefined のままにする', () => {
    const fields = parseOcrText('株式会社サンプル')
    expect(fields.email).toBeUndefined()
    expect(fields.phone).toBeUndefined()
    expect(fields.address).toBeUndefined()
    expect(fields.postalCode).toBeUndefined()
    expect(fields.nameKana).toBeUndefined()
  })

  it('空の入力でも落ちず、すべて undefined になる', () => {
    expect(parseOcrText('')).toEqual({})
    expect(parseOcrText('   \n \n ')).toEqual({})
  })

  it('記号だけの行を name にしない', () => {
    expect(parseOcrText('----\n***').name).toBeUndefined()
  })
})

describe('氏名の推定（bbox）', () => {
  function line(text: string, height: number, top = 0): OcrLine {
    return { text, bbox: { x0: 0, y0: top, x1: 100, y1: top + height } }
  }

  it('残った行のうち文字の高さが最大の行を name にする', () => {
    const fields = parseOcrLines([
      line('株式会社サンプル', 10, 0),
      line('鈴木 一郎', 28, 40),
      line('企画室', 10, 80),
    ])
    expect(fields.name).toBe('鈴木 一郎')
  })

  it('bbox が無ければ上部に近い短い行を name にする', () => {
    const fields = parseOcrLines([
      { text: '株式会社サンプル' },
      { text: '佐藤 花子' },
      { text: '営業部' },
    ])
    expect(fields.name).toBe('佐藤 花子')
  })

  it('カタカナのふりがなも nameKana として拾う', () => {
    const fields = parseOcrText('鈴木 一郎\nスズキ イチロウ')
    expect(fields.nameKana).toBe('スズキ イチロウ')
    expect(fields.name).toBe('鈴木 一郎')
  })

  it('ふりがなを name にしない', () => {
    const fields = parseOcrText('やまだ たろう')
    expect(fields.nameKana).toBe('やまだ たろう')
    expect(fields.name).toBeUndefined()
  })
})

describe('住所', () => {
  it('都道府県で始まる行を address として拾う', () => {
    expect(parseOcrText('神奈川県横浜市西区サンプル1-2-3').address).toBe(
      '神奈川県横浜市西区サンプル1-2-3',
    )
  })

  it('郵便番号だけの行の次の行を address として拾う', () => {
    const fields = parseOcrText('〒100-0001\n東京都千代田区千代田1-1-1')
    expect(fields.postalCode).toBe('100-0001')
    expect(fields.address).toBe('東京都千代田区千代田1-1-1')
  })

  it('〒 が無い 7 桁ハイフンつきでも郵便番号として拾う', () => {
    expect(parseOcrText('100-0001 東京都千代田区').postalCode).toBe('100-0001')
  })
})

describe('英語表記の名刺', () => {
  const fields = parseOcrText(
    [
      'Sample Inc.',
      'Sales Division',
      'Manager',
      'Hanako Sato',
      'hanako.sato@example.com',
      'TEL +81-3-1234-5678',
      'www.example.com',
    ].join('\n'),
  )

  it('メール・電話・URL を拾う', () => {
    expect(fields.email).toBe('hanako.sato@example.com')
    expect(fields.phone).toBe('+81-3-1234-5678')
    expect(fields.website).toBe('www.example.com')
  })

  it('会社名と役職を拾う', () => {
    expect(fields.company).toBe('Sample Inc.')
    expect(fields.title).toBe('Manager')
  })

  it('残りから氏名を拾う', () => {
    expect(fields.name).toBe('Hanako Sato')
  })
})

describe('OCR の揺れに対する耐性', () => {
  it('全角の数字・記号を含む電話番号も読む', () => {
    expect(parseOcrText('ＴＥＬ ０３－１２３４－５６７８').phone).toBe('03-1234-5678')
  })

  it('前後の空白を落とす', () => {
    expect(parseOcrText('   株式会社サンプル   ').company).toBe('株式会社サンプル')
  })

  it('空行が混ざっても無視する', () => {
    expect(parseOcrText('\n\n株式会社サンプル\n\n').company).toBe('株式会社サンプル')
  })
})

/**
 * Tesseract は日本語で文字と文字の間に空白を入れてくる（開発サーバで架空の名刺を読ませて実測）。
 * 整形前のこの形では `株 式 会 社` が COMPANY_PATTERNS に当たらず、抽出が丸ごと空振りしていた。
 * 上のテストはすべて整形済みの入力なので、実際の出力の形でも通ることをここで押さえる。
 */
describe('文字ごとに空白が入った OCR 出力', () => {
  const fields = parseOcrLines([
    { text: '株 式 会 社 サ ンプ ル' },
    { text: '営業 本 部 第 一 営業 部 課 長' },
    { text: '山田 太郎' },
    { text: 'TEL 03-1234-5678' },
  ])

  it('ばらけた会社名でも company に入る', () => {
    expect(fields.company).toBe('株式会社サンプル')
  })

  it('ばらけた行から役職と部署を読み分ける', () => {
    expect(fields.title).toBe('課長')
    expect(fields.department).toBe('営業本部第一営業部')
  })

  it('姓名の区切りの空白は詰めずに氏名へ入れる', () => {
    expect(fields.name).toBe('山田 太郎')
  })

  it('英数字が混ざる行の空白は詰めない', () => {
    expect(fields.phone).toBe('03-1234-5678')
  })
})
