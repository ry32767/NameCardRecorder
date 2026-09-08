import { normalizeOcrLine } from './lines'
import type { OcrLine } from './types'

/** 画像に重ねて表示する 1 行。bbox が無い行は置き場所が決まらないので持たない */
export interface OverlayLine {
  text: string
  bbox: NonNullable<OcrLine['bbox']>
}

/** 表示・コピーに使うのは整形後のテキスト（Tesseract の文字ごとの空白を詰める） */
export function toOverlayLines(lines: readonly OcrLine[]): OverlayLine[] {
  return lines
    .map((line) => ({ text: normalizeOcrLine(line.text), bbox: line.bbox }))
    .filter((line): line is OverlayLine => Boolean(line.bbox) && line.text.length > 0)
}
