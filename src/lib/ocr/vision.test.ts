import { HttpResponse, http } from 'msw'
import { describe, expect, it } from 'vitest'
import { server } from '../../test/server'
import {
  GoogleVisionOcrProvider,
  VISION_KEY_DENIED_MESSAGE,
  VISION_KEY_INVALID_MESSAGE,
  VISION_NETWORK_MESSAGE,
  VISION_QUOTA_MESSAGE,
  toOcrLines,
} from './vision'

const ENDPOINT = 'https://vision.googleapis.com/v1/images:annotate'

/** 実際の応答から、この実装が読む部分だけを架空の名刺で組み直したもの */
function word(text: string, x0: number, y0: number, x1: number, y1: number, breakType?: string) {
  return {
    boundingBox: {
      vertices: [
        { x: x0, y: y0 },
        { x: x1, y: y0 },
        { x: x1, y: y1 },
        { x: x0, y: y1 },
      ],
    },
    symbols: [...text].map((char, index) => ({
      text: char,
      ...(breakType && index === text.length - 1
        ? { property: { detectedBreak: { type: breakType } } }
        : {}),
    })),
  }
}

const ANNOTATION = {
  text: '株式会社サンプル\n山田 太郎\n',
  pages: [
    {
      blocks: [
        {
          paragraphs: [
            { words: [word('株式会社サンプル', 60, 80, 500, 130, 'LINE_BREAK')] },
            {
              words: [
                word('山田', 60, 200, 200, 260, 'SPACE'),
                word('太郎', 220, 200, 360, 260, 'LINE_BREAK'),
              ],
            },
          ],
        },
      ],
    },
  ],
}

function visionResponse(body: Record<string, unknown>, status = 200) {
  return http.post(ENDPOINT, () => HttpResponse.json(body, { status }))
}

describe('toOcrLines', () => {
  it('改行ごとに 1 行にし、bbox は行に含まれる単語の外接矩形にする', () => {
    expect(toOcrLines(ANNOTATION)).toEqual([
      { text: '株式会社サンプル', bbox: { x0: 60, y0: 80, x1: 500, y1: 130 } },
      { text: '山田 太郎', bbox: { x0: 60, y0: 200, x1: 360, y1: 260 } },
    ])
  })

  it('省略された頂点（0）を 0 として扱う', () => {
    const lines = toOcrLines({
      pages: [
        {
          blocks: [
            {
              paragraphs: [
                {
                  words: [
                    {
                      boundingBox: { vertices: [{}, { x: 40 }, { x: 40, y: 20 }, { y: 20 }] },
                      symbols: [{ text: 'A', property: { detectedBreak: { type: 'LINE_BREAK' } } }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    })
    expect(lines).toEqual([{ text: 'A', bbox: { x0: 0, y0: 0, x1: 40, y1: 20 } }])
  })

  it('空の応答でも落ちない', () => {
    expect(toOcrLines({})).toEqual([])
  })
})

describe('GoogleVisionOcrProvider', () => {
  const image = new Blob(['fake'], { type: 'image/jpeg' })

  it('API キーをクエリに載せ、画像を base64 で送る', async () => {
    let sentKey: string | null = null
    let sentContent: string | null = null
    server.use(
      http.post(ENDPOINT, async ({ request }) => {
        sentKey = new URL(request.url).searchParams.get('key')
        const body = (await request.json()) as {
          requests: { image: { content: string }; features: { type: string }[] }[]
        }
        sentContent = body.requests[0]!.image.content
        expect(body.requests[0]!.features[0]!.type).toBe('DOCUMENT_TEXT_DETECTION')
        return HttpResponse.json({ responses: [{ fullTextAnnotation: ANNOTATION }] })
      }),
    )

    const result = await new GoogleVisionOcrProvider('test-key').recognize(image)

    expect(sentKey).toBe('test-key')
    expect(sentContent).toBeTruthy()
    expect(result.lines.map((line) => line.text)).toEqual(['株式会社サンプル', '山田 太郎'])
    expect(result.text).toContain('株式会社サンプル')
  })

  it('進捗を 0 から 1 まで報告する', async () => {
    server.use(visionResponse({ responses: [{ fullTextAnnotation: ANNOTATION }] }))
    const seen: number[] = []
    await new GoogleVisionOcrProvider('test-key').recognize(image, (p) => seen.push(p.progress))
    expect(seen[0]).toBeLessThan(1)
    expect(seen.at(-1)).toBe(1)
  })

  it('文字が 1 つも無い応答は空で返す', async () => {
    server.use(visionResponse({ responses: [{}] }))
    const result = await new GoogleVisionOcrProvider('test-key').recognize(image)
    expect(result).toEqual({ text: '', lines: [] })
  })

  it.each([
    [400, VISION_KEY_INVALID_MESSAGE],
    [403, VISION_KEY_DENIED_MESSAGE],
    [429, VISION_QUOTA_MESSAGE],
  ])('%i のとき理由が分かる文言で失敗する', async (status, message) => {
    server.use(visionResponse({ error: { message: 'nope' } }, status))
    await expect(new GoogleVisionOcrProvider('test-key').recognize(image)).rejects.toThrow(message)
  })

  it('通信できないときは通信のエラーとして扱う', async () => {
    server.use(http.post(ENDPOINT, () => HttpResponse.error()))
    await expect(new GoogleVisionOcrProvider('test-key').recognize(image)).rejects.toThrow(
      VISION_NETWORK_MESSAGE,
    )
  })

  it('エラーに API キーを含めない', async () => {
    server.use(visionResponse({ error: { message: 'nope' } }, 403))
    const secret = 'AIza-secret-key'
    await expect(new GoogleVisionOcrProvider(secret).recognize(image)).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof Error &&
        !error.message.includes(secret) &&
        !`${error.stack}`.includes(secret),
    )
  })
})

describe('失敗したときに理由を伝える', () => {
  const image = new Blob(['fake'], { type: 'image/jpeg' })

  /** Google が実際に返す形（403 のとき details に reason が入る） */
  function denied(reason: string) {
    return {
      error: {
        code: 403,
        message: 'Requests from referer <empty> are blocked.',
        status: 'PERMISSION_DENIED',
        details: [{ '@type': 'type.googleapis.com/google.rpc.ErrorInfo', reason }],
      },
    }
  }

  it.each([
    ['SERVICE_DISABLED', /Cloud Vision API が有効になっていません/],
    ['API_KEY_HTTP_REFERRER_BLOCKED', /リファラー制限/],
    ['API_KEY_SERVICE_BLOCKED', /API の制限/],
    ['BILLING_DISABLED', /課金が有効になっていません/],
  ])('%s のときは次に何をすればいいかを出す', async (reason, expected) => {
    server.use(visionResponse(denied(reason), 403))
    await expect(new GoogleVisionOcrProvider('test-key').recognize(image)).rejects.toThrow(expected)
  })

  it('知らない理由なら Google の原文を添える', async () => {
    server.use(
      visionResponse({ error: { code: 403, message: 'Something new happened.' } }, 403),
    )
    await expect(new GoogleVisionOcrProvider('test-key').recognize(image)).rejects.toThrow(
      /Something new happened\./,
    )
  })

  it('200 でも画像ごとのエラーがあれば理由を出す', async () => {
    server.use(visionResponse({ responses: [{ error: { message: 'Image too large.' } }] }))
    await expect(new GoogleVisionOcrProvider('test-key').recognize(image)).rejects.toThrow(
      /Image too large\./,
    )
  })

  it('本文が JSON でなくても落ちず、状態から判断した文言を出す', async () => {
    server.use(http.post(ENDPOINT, () => new HttpResponse('<html>500</html>', { status: 403 })))
    await expect(new GoogleVisionOcrProvider('test-key').recognize(image)).rejects.toThrow(
      VISION_KEY_DENIED_MESSAGE,
    )
  })
})
