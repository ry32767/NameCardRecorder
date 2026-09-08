import { describe, expect, it } from 'vitest'
import { boundingBox, toOcrResult } from './paddleResult'
import type { PaddleItem } from './paddleResult'

/** PaddleOCR の実際の戻り値の形（頂点は左上→右上→右下→左下） */
function item(text: string, x0: number, y0: number, x1: number, y1: number, score = 0.95): PaddleItem {
  return {
    text,
    score,
    poly: [
      [x0, y0],
      [x1, y0],
      [x1, y1],
      [x0, y1],
    ],
  }
}

describe('boundingBox', () => {
  it('傾いた四角形でも、全頂点を含む軸平行の矩形になる', () => {
    const bbox = boundingBox([
      [60, 82],
      [500, 78],
      [502, 128],
      [62, 132],
    ])
    expect(bbox).toEqual({ x0: 60, y0: 78, x1: 502, y1: 132 })
  })

  it('潰れた矩形は置き場所が決まらないので持たない', () => {
    expect(boundingBox([[10, 10], [10, 10], [10, 10], [10, 10]])).toBeUndefined()
    expect(boundingBox([])).toBeUndefined()
  })
})

describe('toOcrResult', () => {
  it('行のテキスト・座標・信頼度を共通形式に移す', () => {
    const result = toOcrResult([item('株式会社サンプル', 60, 80, 500, 130, 0.977)])

    expect(result.lines).toEqual([
      {
        text: '株式会社サンプル',
        bbox: { x0: 60, y0: 80, x1: 500, y1: 130 },
        confidence: 0.977,
      },
    ])
    expect(result.text).toBe('株式会社サンプル')
  })

  it('検出順がばらばらでも読み順（上から、同じ高さなら左から）に並べ直す', () => {
    const result = toOcrResult([
      item('taro.yamada@example.co.jp', 60, 520, 460, 550),
      item('山田 太郎', 60, 260, 300, 320),
      item('FAX 03-1234-5679', 420, 430, 700, 460),
      item('TEL 03-1234-5678', 60, 428, 340, 458),
    ])

    expect(result.lines.map((line) => line.text)).toEqual([
      '山田 太郎',
      'TEL 03-1234-5678',
      'FAX 03-1234-5679',
      'taro.yamada@example.co.jp',
    ])
    // 生テキストも同じ並びで作る（Issue 本文にそのまま残す）
    expect(result.text.split('\n')).toHaveLength(4)
  })

  it('空文字の行は捨てる', () => {
    const result = toOcrResult([item('  ', 10, 10, 40, 30), item('課長', 60, 195, 111, 226)])
    expect(result.lines.map((line) => line.text)).toEqual(['課長'])
  })

  it('PaddleOCR は文字ごとに空白を入れてこないので、行はそのまま使える', () => {
    // Tesseract の `株 式 会 社` と違い、詰め直しが要らないことを形で残しておく
    const result = toOcrResult([item('営業本部 第一営業部', 59, 157, 283, 184)])
    expect(result.lines[0]?.text).toBe('営業本部 第一営業部')
  })
})
