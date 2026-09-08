import { createWorker } from 'tesseract.js'
import type { OcrLine, OcrPhase, OcrProgress, OcrProvider, OcrResult } from './types'

/**
 * tesseract.js の status を段階に振り分ける。
 * 言語データの取得（初回だけ 10MB 超）と認識を、画面で言い分けるために使う。
 */
export function phaseFor(status: string): OcrPhase {
  return status.includes('recognizing') ? 'recognize' : 'model'
}

/**
 * Tesseract.js による OcrProvider 実装。
 *
 * tesseract.js は内部で Web Worker を立てるので、認識中もメインスレッドは止まらない
 * （docs/spec.md 機能1「OCR 中も画面が固まらない」）。
 * 既定は PaddleOCR で、こちらは軽い方の選択肢として残している。
 * 言語データ（jpn+eng）は CDN から取得する。**画像は外に出ない** — 送るのではなく、
 * 辞書を取ってきてブラウザ内で処理する（docs/architecture.md のプライバシー前提）。
 */
export class TesseractOcrProvider implements OcrProvider {
  private workerPromise: ReturnType<typeof createWorker> | null = null

  private getWorker(onProgress?: (progress: OcrProgress) => void) {
    this.workerPromise ??= createWorker(['jpn', 'eng'], undefined, {
      logger: (message: { status: string; progress: number }) => {
        onProgress?.({
          status: message.status,
          progress: message.progress,
          phase: phaseFor(message.status),
        })
      },
    })
    return this.workerPromise
  }

  async recognize(image: Blob, onProgress?: (progress: OcrProgress) => void): Promise<OcrResult> {
    const worker = await this.getWorker(onProgress)
    const { data } = await worker.recognize(image)

    return {
      text: data.text,
      lines: toOcrLines(data),
    }
  }

  async terminate(): Promise<void> {
    if (!this.workerPromise) return
    const worker = await this.workerPromise
    this.workerPromise = null
    await worker.terminate()
  }
}

/** tesseract.js の戻り値のうち、parser が必要とする行と bbox だけを取り出す */
interface RecognizeData {
  text: string
  lines?: { text: string; bbox?: { x0: number; y0: number; x1: number; y1: number } }[]
}

export function toOcrLines(data: RecognizeData): OcrLine[] {
  if (data.lines && data.lines.length > 0) {
    return data.lines
      .map((line) => {
        const text = line.text.trim()
        return line.bbox ? { text, bbox: line.bbox } : { text }
      })
      .filter((line) => line.text.length > 0)
  }
  // bbox が取れないビルドでも、テキストだけで抽出は動くようにする
  return data.text
    .split(/\r?\n/)
    .map((text) => ({ text: text.trim() }))
    .filter((line) => line.text.length > 0)
}
