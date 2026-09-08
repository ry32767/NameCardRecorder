import { toOcrResult } from './paddleResult'
import type { PaddleItem } from './paddleResult'
import type { OcrProgress, OcrProvider, OcrResult } from './types'

/** モデルの取得に失敗したときの目印。呼び出し側が Tesseract を勧める文言に使う */
export class PaddleOcrError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PaddleOcrError'
  }
}

export const PADDLE_LOAD_FAILED_MESSAGE =
  'PaddleOCR の読み込みに失敗しました。通信できないか、モデルを取得できませんでした'

/** 読み込み中に見せる文言（spec 4.2） */
export const PADDLE_LOADING_STATUS = 'OCR モデルを読み込んでいます…'
export const PADDLE_READY_STATUS = 'PaddleOCR 準備完了'

/** 認識できたとみなす下限。これを下回る行は雑音なので拾わない */
const SCORE_THRESHOLD = 0.5

/**
 * PaddleOCR（PP-OCRv5 の日本語モデル）による OcrProvider 実装。
 *
 * 推論は SDK の Worker の中で ONNX Runtime Web（WASM）が回すので、認識中もメインスレッドは
 * 止まらない。**画像は端末から出ない** — 出ていくのはモデルの取得だけ。
 *
 * SDK 本体（OpenCV を含む Worker で 10MB 超）とモデル（約 21MB）はどちらも重いので、
 * import はこのファイルの中に閉じ込め、`createOcrProvider` から動的に読む。
 * 初期表示のバンドルには一切載せない（スマホで開いたときに重くしないための肝）。
 */
export class PaddleOcrProvider implements OcrProvider {
  private ocrPromise: Promise<PaddleOcrSession> | null = null

  private load(onProgress?: (progress: OcrProgress) => void): Promise<PaddleOcrSession> {
    this.ocrPromise ??= (async () => {
      // SDK は細かい進捗を返さないので、段階だけを伝える
      onProgress?.({ progress: 0.05, status: PADDLE_LOADING_STATUS, phase: 'model' })
      try {
        const { PaddleOCR } = await import('@paddleocr/paddleocr-js')
        const ocr = await PaddleOCR.create({
          lang: 'japan',
          ocrVersion: 'PP-OCRv5',
          // 推論を Worker に追い出す。ORT の wasm proxy は SDK 側で切られる
          worker: true,
          // 既定のまま。スレッド版 wasm は SharedArrayBuffer（COOP/COEP）が要るが、
          // GitHub Pages はヘッダを足せないので単一スレッドで動かす
          ortOptions: { backend: 'auto' },
        })
        onProgress?.({ progress: 0.5, status: PADDLE_READY_STATUS, phase: 'model' })
        return ocr
      } catch (error) {
        // 次に読み取るときにやり直せるよう、失敗した約束は残さない
        this.ocrPromise = null
        throw new PaddleOcrError(
          `${PADDLE_LOAD_FAILED_MESSAGE}${error instanceof Error && error.message ? `（${error.message}）` : ''}`,
        )
      }
    })()
    return this.ocrPromise
  }

  async recognize(image: Blob, onProgress?: (progress: OcrProgress) => void): Promise<OcrResult> {
    const ocr = await this.load(onProgress)

    onProgress?.({ progress: 0.6, status: '文字を読み取っています…', phase: 'recognize' })
    const [result] = await ocr.predict(image, { textRecScoreThresh: SCORE_THRESHOLD })
    onProgress?.({ progress: 1, status: '読み取りました', phase: 'recognize' })

    return toOcrResult(result?.items ?? [])
  }

  async terminate(): Promise<void> {
    if (!this.ocrPromise) return
    const pending = this.ocrPromise
    this.ocrPromise = null
    try {
      const ocr = await pending
      await ocr.dispose()
    } catch {
      // 読み込みに失敗していたら片付けるものも無い
    }
  }
}

/** SDK のうち、この実装が使う分だけ。戻り値の型を `any` で受けないための最小の形 */
interface PaddleOcrSession {
  predict(image: Blob, params?: { textRecScoreThresh?: number }): Promise<{ items: PaddleItem[] }[]>
  dispose(): Promise<void>
}
