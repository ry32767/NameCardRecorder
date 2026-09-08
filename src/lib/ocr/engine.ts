import type { PreparedImage } from './image'
import type { OcrProvider } from './types'
import type { Settings } from '../settings'

/**
 * どの OCR で読むかの選択。
 *
 * 既定はブラウザ内の Tesseract（画像が外に出ない）。設定に Cloud Vision の
 * API キーが入っているときだけ Vision を使う（docs/architecture.md の 5. OCR パイプライン）。
 */
export type OcrEngine = 'tesseract' | 'vision'

export const ENGINE_LABELS: Record<OcrEngine, string> = {
  tesseract: 'この端末（Tesseract）',
  vision: 'Cloud Vision',
}

export function engineFor(settings: Settings | null): OcrEngine {
  return settings?.visionApiKey ? 'vision' : 'tesseract'
}

/** 重いので、実際に読み取るときまで読み込まない（初期表示を軽く保つ） */
export async function createOcrProvider(
  engine: OcrEngine,
  settings: Settings | null,
): Promise<OcrProvider> {
  if (engine === 'vision' && settings?.visionApiKey) {
    const { GoogleVisionOcrProvider } = await import('./vision')
    return new GoogleVisionOcrProvider(settings.visionApiKey)
  }
  const { TesseractOcrProvider } = await import('./tesseract')
  return new TesseractOcrProvider()
}

/**
 * エンジンに渡す画像を選ぶ。
 * Tesseract は低コントラストに弱いのでグレースケール強調した方を、
 * Vision は前処理なしのカラーの方が精度が出るので保存用の方を渡す。
 */
export function ocrInputBlob(engine: OcrEngine, image: PreparedImage): Blob {
  return engine === 'vision' ? image.storageBlob : image.ocrBlob
}
