import type { PreparedImage } from './image'
import type { OcrProvider } from './types'
import type { Settings } from '../settings'

/**
 * どの OCR で読むかの選択。
 *
 * **どちらもブラウザ内で動き、名刺画像は端末から出ない。**
 * 既定は PaddleOCR（PP-OCRv5 の日本語モデル）。Tesseract は、モデルを取れないときや
 * 端末が非力なときのための軽い方の選択肢として残す（docs/architecture.md の 5. OCR パイプライン）。
 */
export type OcrEngine = 'paddle' | 'tesseract'

export const ENGINE_LABELS: Record<OcrEngine, string> = {
  paddle: 'PaddleOCR（推奨）',
  tesseract: 'Tesseract.js（軽量）',
}

export function engineFor(settings: Settings | null): OcrEngine {
  return settings?.ocrEngine ?? 'paddle'
}

/** 重いので、実際に読み取るときまで読み込まない（初期表示を軽く保つ） */
export async function createOcrProvider(engine: OcrEngine): Promise<OcrProvider> {
  if (engine === 'paddle') {
    const { PaddleOcrProvider } = await import('./paddle')
    return new PaddleOcrProvider()
  }
  const { TesseractOcrProvider } = await import('./tesseract')
  return new TesseractOcrProvider()
}

/**
 * エンジンに渡す画像を選ぶ。
 * Tesseract は低コントラストに弱いのでグレースケール強調した方を、
 * PaddleOCR は前処理なしのカラーの方が精度が出る（検出モデルが色つきの実画像で学習されている）
 * ので保存用の方を渡す。
 */
export function ocrInputBlob(engine: OcrEngine, image: PreparedImage): Blob {
  return engine === 'paddle' ? image.storageBlob : image.ocrBlob
}
