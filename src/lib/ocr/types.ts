/** OCR エンジンが返す 1 行。bbox は氏名の推定（文字の高さ）に使う */
export interface OcrLine {
  text: string
  bbox?: { x0: number; y0: number; x1: number; y1: number }
}

export interface OcrResult {
  /** 生テキスト（Issue 本文の details に畳んで残す） */
  text: string
  lines: OcrLine[]
}

export interface OcrProgress {
  /** 0–1 */
  progress: number
  status: string
}

/**
 * OCR の実装を差し替えられるようにするためのインタフェース。
 * 呼び出し側はこれにだけ依存する（docs/architecture.md）。
 * Phase 2 でクラウド OCR / LLM に差し替える余地を残す。
 */
export interface OcrProvider {
  recognize(image: Blob, onProgress?: (progress: OcrProgress) => void): Promise<OcrResult>
  terminate(): Promise<void>
}
