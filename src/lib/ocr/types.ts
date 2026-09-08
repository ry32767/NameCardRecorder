/** OCR エンジンが返す 1 行。bbox は氏名の推定（文字の高さ）と重ね表示に使う */
export interface OcrLine {
  text: string
  bbox?: { x0: number; y0: number; x1: number; y1: number }
  /** 0–1。エンジンが返さないときは undefined */
  confidence?: number
}

export interface OcrResult {
  /** 生テキスト（Issue 本文の details に畳んで残す） */
  text: string
  lines: OcrLine[]
}

/**
 * 進捗の段階。モデルの取得は初回だけ数十 MB 掛かるので、
 * 「読み取っている」のか「まだ準備をしている」のかを画面で区別できるようにする
 * （spec の 4.2 / 21）。
 */
export type OcrPhase = 'model' | 'recognize'

export interface OcrProgress {
  /** 0–1 */
  progress: number
  status: string
  phase: OcrPhase
}

/**
 * OCR の実装を差し替えられるようにするためのインタフェース。
 * 呼び出し側はこれにだけ依存する（docs/architecture.md）。
 */
export interface OcrProvider {
  recognize(image: Blob, onProgress?: (progress: OcrProgress) => void): Promise<OcrResult>
  terminate(): Promise<void>
}
