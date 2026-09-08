import { blobToBase64 } from './image'
import type { OcrLine, OcrProgress, OcrProvider, OcrResult } from './types'

/**
 * Google Cloud Vision による OcrProvider 実装。
 *
 * **画像が Google に送られる**点で Tesseract と前提が違う（docs/architecture.md のプライバシー節）。
 * 使うのは API キーが設定されているときだけで、既定はブラウザ内で完結する Tesseract のまま。
 *
 * 日本語の縦横混在レイアウトに強く、Tesseract のように文字ごとに空白が入らないので、
 * `src/lib/ocr/parser.ts` の抽出がそのまま素直に効く。
 */
const ENDPOINT = 'https://vision.googleapis.com/v1/images:annotate'

export const VISION_KEY_INVALID_MESSAGE = 'Cloud Vision の API キーが正しくありません'
export const VISION_KEY_DENIED_MESSAGE =
  'Cloud Vision に拒否されました。API の有効化・キーの制限・課金設定を確認してください'
export const VISION_QUOTA_MESSAGE = 'Cloud Vision の利用上限に達しました。しばらく待つか上限を確認してください'
export const VISION_NETWORK_MESSAGE = 'Cloud Vision に接続できませんでした'
export const VISION_FAILED_MESSAGE = 'Cloud Vision で読み取れませんでした'

/**
 * Google が返す `error.details[].reason` ごとの、**次に何をすればいいか**が分かる文言。
 *
 * 403 をひとまとめに「拒否されました」と出していたら、実際に詰まったときに
 * 原因が分からなかった。理由コードは Google 側が返してくれているので、そのまま活かす。
 */
export const VISION_REASON_MESSAGES: Record<string, string> = {
  SERVICE_DISABLED:
    'この Google Cloud プロジェクトで Cloud Vision API が有効になっていません。API を有効化してください',
  // 画面にそのまま出る文言なので Markdown 記法は使わない（Notice は素のテキストを描く）
  API_KEY_HTTP_REFERRER_BLOCKED:
    'API キーのリファラー制限がこの URL を許していません。ブラウザが送るのはオリジンだけ（例: https://ry32767.github.io/）でパスは落ちるので、制限にはパスを含めず「https://ry32767.github.io/*」の形で登録してください。開発中は「http://localhost:5173/*」も必要です',
  API_KEY_SERVICE_BLOCKED:
    'API キーの「API の制限」に Cloud Vision API が入っていません。対象に追加してください',
  API_KEY_IP_ADDRESS_BLOCKED: 'API キーの IP 制限がこの端末を許していません',
  API_KEY_ANDROID_APP_BLOCKED: 'API キーの制限がアプリ用になっています。HTTP リファラー制限に変えてください',
  API_KEY_IOS_APP_BLOCKED: 'API キーの制限がアプリ用になっています。HTTP リファラー制限に変えてください',
  API_KEY_INVALID: VISION_KEY_INVALID_MESSAGE,
  BILLING_DISABLED:
    'この Google Cloud プロジェクトで課金が有効になっていません。請求先アカウントを紐づけてください',
  ACCOUNT_STATE_INVALID: 'Google Cloud アカウントの状態を確認してください（支払いの停止など）',
  RATE_LIMIT_EXCEEDED: VISION_QUOTA_MESSAGE,
}

export class VisionOcrError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'VisionOcrError'
  }
}

export class GoogleVisionOcrProvider implements OcrProvider {
  constructor(private readonly apiKey: string) {}

  async recognize(image: Blob, onProgress?: (progress: OcrProgress) => void): Promise<OcrResult> {
    // 1 リクエストで返るので進捗は刻めない。送信中であることだけ伝える
    onProgress?.({ progress: 0.1, status: 'uploading' })

    const body = JSON.stringify({
      requests: [
        {
          image: { content: await blobToBase64(image) },
          features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
          // 名刺は日英が混ざる。ヒントを与えると英字の誤認識が減る
          imageContext: { languageHints: ['ja', 'en'] },
        },
      ],
    })

    let response: Response
    try {
      // キーはクエリに乗せるしかない（API の仕様）。URL はログにも例外にも出さない
      response = await fetch(`${ENDPOINT}?key=${encodeURIComponent(this.apiKey)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      })
    } catch {
      throw new VisionOcrError(VISION_NETWORK_MESSAGE)
    }

    onProgress?.({ progress: 0.8, status: 'recognizing text' })

    // 失敗の本文には Google 自身の理由が入っている。読み捨てると切り分けができない
    const payload = (await response.json().catch(() => null)) as VisionAnnotateResponse | null

    if (!response.ok) {
      throw new VisionOcrError(explain(payload?.error, messageForStatus(response.status)))
    }

    const result = payload?.responses?.[0]
    // 200 でも画像ごとに error が入ることがある（画像が大きすぎる、など）
    if (!result || result.error) {
      throw new VisionOcrError(explain(result?.error, VISION_FAILED_MESSAGE))
    }

    onProgress?.({ progress: 1, status: 'done' })

    const annotation = result.fullTextAnnotation
    if (!annotation) return { text: '', lines: [] }

    return { text: annotation.text ?? '', lines: toOcrLines(annotation) }
  }

  async terminate(): Promise<void> {
    // 常駐するものが無い（Worker を持つ Tesseract 実装との差はここだけ）
  }
}

/**
 * Google のエラーを、こちらの文言に翻訳する。
 * 理由コードが分かればそれを使い、分からなければ**Google の原文をそのまま添える**
 * （こちらで潰してしまうと、次に何をすればいいか分からなくなる）。
 */
function explain(error: VisionError | undefined, fallback: string): string {
  if (!error) return fallback

  for (const detail of error.details ?? []) {
    const known = detail.reason ? VISION_REASON_MESSAGES[detail.reason] : undefined
    if (known) return known
  }
  const known = error.status ? VISION_REASON_MESSAGES[error.status] : undefined
  if (known) return known

  return error.message ? `${fallback}（Google からの応答: ${error.message}）` : fallback
}

function messageForStatus(status: number): string {
  if (status === 400 || status === 401) return VISION_KEY_INVALID_MESSAGE
  if (status === 403) return VISION_KEY_DENIED_MESSAGE
  if (status === 429) return VISION_QUOTA_MESSAGE
  return VISION_FAILED_MESSAGE
}

interface VisionVertex {
  /** 0 のときキー自体が省略される。既定 0 として扱う */
  x?: number
  y?: number
}

interface VisionSymbol {
  text?: string
  property?: { detectedBreak?: { type?: string } }
}

interface VisionWord {
  symbols?: VisionSymbol[]
  boundingBox?: { vertices?: VisionVertex[] }
}

interface VisionError {
  code?: number
  message?: string
  status?: string
  details?: { reason?: string }[]
}

interface VisionAnnotateResponse {
  /** リクエスト全体が弾かれたとき（キー・API 有効化・課金など） */
  error?: VisionError
  responses?: {
    /** 画像ごとの失敗 */
    error?: VisionError
    fullTextAnnotation?: VisionTextAnnotation
  }[]
}

interface VisionTextAnnotation {
  text?: string
  pages?: { blocks?: { paragraphs?: { words?: VisionWord[] }[] }[] }[]
}

/** 改行を意味する break。ここで 1 行を切る */
const LINE_BREAKS = new Set(['LINE_BREAK', 'EOL_SURE_SPACE'])
/** 空白を意味する break。行の途中の区切りとして残す */
const SPACE_BREAKS = new Set(['SPACE', 'SURE_SPACE'])

interface LineBuilder {
  text: string
  x0: number
  y0: number
  x1: number
  y1: number
  hasBox: boolean
}

/**
 * Vision の階層（ページ → ブロック → 段落 → 単語 → 文字）を、
 * parser が扱う「行 + bbox」に畳む。
 *
 * 段落をそのまま 1 行にすると複数行が繋がってしまうので、
 * **文字ごとの detectedBreak を見て改行で切る**。bbox は行に含まれる単語の外接矩形。
 */
export function toOcrLines(annotation: VisionTextAnnotation): OcrLine[] {
  const lines: OcrLine[] = []
  let current = newLine()

  function flush() {
    const text = current.text.trim()
    if (text) {
      lines.push(current.hasBox ? { text, bbox: box(current) } : { text })
    }
    current = newLine()
  }

  for (const page of annotation.pages ?? []) {
    for (const block of page.blocks ?? []) {
      for (const paragraph of block.paragraphs ?? []) {
        for (const word of paragraph.words ?? []) {
          extend(current, word)
          for (const symbol of word.symbols ?? []) {
            current.text += symbol.text ?? ''
            const type = symbol.property?.detectedBreak?.type
            if (!type) continue
            if (LINE_BREAKS.has(type)) flush()
            else if (SPACE_BREAKS.has(type)) current.text += ' '
          }
        }
        // 段落の終わりに break が付かないことがあるので、ここでも必ず切る
        flush()
      }
    }
  }
  flush()

  return lines
}

function newLine(): LineBuilder {
  return { text: '', x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity, hasBox: false }
}

/** 単語の 4 頂点で行の外接矩形を広げる。頂点は軸平行とは限らないので min/max を取る */
function extend(line: LineBuilder, word: VisionWord): void {
  for (const vertex of word.boundingBox?.vertices ?? []) {
    const x = vertex.x ?? 0
    const y = vertex.y ?? 0
    line.x0 = Math.min(line.x0, x)
    line.y0 = Math.min(line.y0, y)
    line.x1 = Math.max(line.x1, x)
    line.y1 = Math.max(line.y1, y)
    line.hasBox = true
  }
}

function box(line: LineBuilder) {
  return { x0: line.x0, y0: line.y0, x1: line.x1, y1: line.y1 }
}
