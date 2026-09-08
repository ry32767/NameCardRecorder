import { describe, expect, it } from 'vitest'
import {
  NAME_PLACEHOLDER,
  SCHEMA_MARKER,
  buildIssueTitle,
  normalizeTags,
  parseIssueBody,
  serializeIssueBody,
} from './serialize'
import { emptyCardFields } from './types'
import type { CardFields } from './types'

const ctx = { owner: 'sample-user', repo: 'namecard-data', branch: 'main' }

// テストデータは必ず架空の人物・会社で作る（AGENTS.md の Do NOT）
function sampleCard(overrides: Partial<CardFields> = {}): CardFields {
  return {
    ...emptyCardFields(),
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
    image: 'cards/images/2026/20260908-013a.jpg',
    imageBack: 'cards/images/2026/20260908-013a-back.jpg',
    tags: ['要フォロー'],
    memo: '新製品の件で再連絡する。',
    ocrText: '株式会社サンプル\n営業本部 第一営業部 課長\n山田 太郎',
    ocrTextBack: 'Sample Inc.\nTaro Yamada\nSales Division',
    ...overrides,
  }
}

describe('serializeIssueBody', () => {
  it('スキーマのマーカーを先頭に書く', () => {
    expect(serializeIssueBody(sampleCard(), ctx).startsWith(SCHEMA_MARKER)).toBe(true)
  })

  it('空のフィールドはキーごと省略する', () => {
    const body = serializeIssueBody(sampleCard({ fax: '', mobile: '', website: '' }), ctx)
    expect(body).not.toContain('fax:')
    expect(body).not.toContain('mobile:')
    expect(body).not.toContain('website:')
    expect(body).toContain('phone: 03-1234-5678')
  })

  it('空文字を "" として書き出さない', () => {
    const body = serializeIssueBody(sampleCard({ department: '' }), ctx)
    expect(body).not.toContain('department')
  })

  it('表裏の画像を raw URL 付きの Markdown で参照する', () => {
    const body = serializeIssueBody(sampleCard(), ctx)
    expect(body).toContain(
      '![名刺（表）](https://github.com/sample-user/namecard-data/blob/main/cards/images/2026/20260908-013a.jpg?raw=true)',
    )
    expect(body).toContain(
      '![名刺（裏）](https://github.com/sample-user/namecard-data/blob/main/cards/images/2026/20260908-013a-back.jpg?raw=true)',
    )
  })

  it('裏面が無ければ裏の画像行を書かない', () => {
    const body = serializeIssueBody(sampleCard({ imageBack: '' }), ctx)
    expect(body).toContain('![名刺（表）]')
    expect(body).not.toContain('![名刺（裏）]')
  })

  it('OCR 生テキストを表裏それぞれの details に畳む', () => {
    const body = serializeIssueBody(sampleCard(), ctx)
    expect(body).toContain('<details><summary>OCR 生テキスト（表）</summary>')
    expect(body).toContain('<details><summary>OCR 生テキスト（裏）</summary>')
    expect(body).toContain('山田 太郎')
    expect(body).toContain('Sales Division')
  })
})

describe('parseIssueBody / ラウンドトリップ', () => {
  it('serialize したものを parse すると元に戻る', () => {
    const original = sampleCard()
    const parsed = parseIssueBody(serializeIssueBody(original, ctx))
    expect(parsed).toEqual(original)
  })

  it('空欄が多い名刺でもラウンドトリップする', () => {
    const original = { ...emptyCardFields(), company: '合同会社テスト', metOn: '2026-01-02' }
    const parsed = parseIssueBody(serializeIssueBody(original, ctx))
    expect(parsed).toEqual(original)
  })

  // 住所・会社名にはコロンや記号が普通に入る。ここが壊れるとデータが静かに壊れる
  it.each([
    ['コロンを含む会社名', { company: '株式会社サンプル: 東京支社' }],
    ['コロンで終わる部署', { department: '営業本部:' }],
    ['ハイフン始まりの住所', { address: '-1-2-3 サンプル町' }],
    ['シャープを含むメモ対象外の値', { metAt: 'サンプル会館 #3ホール' }],
    ['引用符を含む会社名', { company: '株式会社"サンプル"' }],
    ['数字だけの部署', { department: '2024' }],
    ['true という文字列', { metAt: 'true' }],
    ['前後に空白がある値は trim される想定', { title: '課長' }],
    ['バックスラッシュを含む住所', { address: 'サンプルビル \\ 別館' }],
    ['エスケープに見える文字列', { memo: 'C:\\path\\n not a newline' }],
    ['波括弧始まりの値', { memo: '{要確認}' }],
    ['URL（コロンを含む）', { website: 'https://example.co.jp:8443/path' }],
  ])('%s がラウンドトリップする', (_name, overrides) => {
    const original = sampleCard(overrides)
    const parsed = parseIssueBody(serializeIssueBody(original, ctx))
    expect(parsed).toEqual(original)
  })

  it('改行を含むメモがラウンドトリップする', () => {
    const original = sampleCard({ memo: '1 行目\n\n3 行目' })
    const parsed = parseIssueBody(serializeIssueBody(original, ctx))
    expect(parsed.memo).toBe('1 行目\n\n3 行目')
  })

  it('複数タグがラウンドトリップする', () => {
    const original = sampleCard({ tags: ['要フォロー', '展示会2026'] })
    const parsed = parseIssueBody(serializeIssueBody(original, ctx))
    expect(parsed.tags).toEqual(['要フォロー', '展示会2026'])
  })

  it('表と裏の OCR テキストが取り違えられずにラウンドトリップする', () => {
    const original = sampleCard()
    const parsed = parseIssueBody(serializeIssueBody(original, ctx))
    expect(parsed.ocrText).toBe(original.ocrText)
    expect(parsed.ocrTextBack).toBe(original.ocrTextBack)
    expect(parsed.image).toBe(original.image)
    expect(parsed.imageBack).toBe(original.imageBack)
  })

  it('裏だけ OCR テキストがある場合も読み分けられる', () => {
    const original = sampleCard({ ocrText: '' })
    const parsed = parseIssueBody(serializeIssueBody(original, ctx))
    expect(parsed.ocrText).toBe('')
    expect(parsed.ocrTextBack).toBe(original.ocrTextBack)
  })

  // 表裏を分ける前に作られた Issue（summary が「OCR 生テキスト」だけ）も読めること
  it('旧形式の単一 details を表の OCR テキストとして読む（後方互換）', () => {
    const body = [
      '<!-- namecard:v1 -->',
      '',
      '```yaml',
      'name: 佐藤 花子',
      'image: cards/images/2026/20260101-aaaa.jpg',
      '```',
      '',
      '<details><summary>OCR 生テキスト</summary>',
      '',
      '```text',
      '有限会社テスト',
      '```',
      '',
      '</details>',
    ].join('\n')

    const parsed = parseIssueBody(body)
    expect(parsed.ocrText).toBe('有限会社テスト')
    expect(parsed.ocrTextBack).toBe('')
    expect(parsed.image).toBe('cards/images/2026/20260101-aaaa.jpg')
    expect(parsed.imageBack).toBe('')
  })

  it('マーカーが無い本文でも YAML が読めれば読む（後方互換）', () => {
    const body = ['```yaml', 'name: 佐藤 花子', 'company: 有限会社テスト', '```'].join('\n')
    const parsed = parseIssueBody(body)
    expect(parsed.name).toBe('佐藤 花子')
    expect(parsed.company).toBe('有限会社テスト')
  })

  it('知らないキーがあっても落ちない（前方互換）', () => {
    const body = ['```yaml', 'name: 佐藤 花子', 'unknownKey: 何か', '```'].join('\n')
    expect(parseIssueBody(body).name).toBe('佐藤 花子')
  })

  it('本文が空でも空のフィールドを返す', () => {
    expect(parseIssueBody(null)).toEqual(emptyCardFields())
    expect(parseIssueBody('')).toEqual(emptyCardFields())
  })

  it('YAML ブロックが壊れていても他の項目は読める', () => {
    const body = ['<!-- namecard:v1 -->', '（YAML ブロックなし）', '', '## メモ', '', '手書き'].join(
      '\n',
    )
    expect(parseIssueBody(body).memo).toBe('手書き')
  })
})

describe('buildIssueTitle', () => {
  it('氏名 - 会社名 になる', () => {
    expect(buildIssueTitle({ name: '山田 太郎', company: '株式会社サンプル' })).toBe(
      '山田 太郎 - 株式会社サンプル',
    )
  })

  it('氏名が空なら (氏名未入力) を使う', () => {
    expect(buildIssueTitle({ name: '', company: '株式会社サンプル' })).toBe(
      `${NAME_PLACEHOLDER} - 株式会社サンプル`,
    )
  })

  it('会社名が空なら氏名だけ', () => {
    expect(buildIssueTitle({ name: '山田 太郎', company: '' })).toBe('山田 太郎')
  })
})

describe('normalizeTags', () => {
  it('空・重複を落とし、カンマを空白に置き換える', () => {
    expect(normalizeTags([' 要フォロー ', '要フォロー', '', 'A,B'])).toEqual(['要フォロー', 'A B'])
  })
})
