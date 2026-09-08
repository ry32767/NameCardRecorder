import type { OcrLine, OcrResult } from './types'

/**
 * PaddleOCR が返す 1 件。SDK の `OcrResultItem` と同じ形を**構造で**受ける。
 * ここで SDK を import しない（ONNX Runtime と OpenCV が jsdom に降ってきてテストが回らなくなる）。
 */
export interface PaddleItem {
  /** 検出した四角形の 4 頂点 `[x, y]`。傾いた行では軸平行にならない */
  poly: readonly (readonly [number, number])[]
  text: string
  score: number
}

/**
 * 四角形の外接矩形。重ね表示は軸平行の矩形で描くので、頂点の最小・最大を取る。
 * 座標は OCR に掛けた画像の実寸のまま扱う（`OcrOverlay` が viewBox で追従させる）。
 */
export function boundingBox(poly: PaddleItem['poly']): OcrLine['bbox'] | undefined {
  if (poly.length === 0) return undefined
  const xs = poly.map(([x]) => x)
  const ys = poly.map(([, y]) => y)
  const bbox = {
    x0: Math.min(...xs),
    y0: Math.min(...ys),
    x1: Math.max(...xs),
    y1: Math.max(...ys),
  }
  // 潰れた矩形は置き場所が決まらないので持たない（テキストだけの行として扱う）
  return bbox.x1 > bbox.x0 && bbox.y1 > bbox.y0 ? bbox : undefined
}

/**
 * 検出結果を共通形式に直す。
 *
 * 並びは**読み順（上から、同じ高さなら左から）**に揃える。項目抽出が行の順序を見る
 * （氏名の推定など）ので、検出順のままにするとカードごとに結果が揺れる。
 */
export function toOcrResult(items: readonly PaddleItem[]): OcrResult {
  const lines: OcrLine[] = items
    .map((item) => {
      const text = item.text.trim()
      const bbox = boundingBox(item.poly)
      return { text, ...(bbox ? { bbox } : {}), confidence: item.score }
    })
    .filter((line) => line.text.length > 0)

  lines.sort(compareReadingOrder)

  return { text: lines.map((line) => line.text).join('\n'), lines }
}

/** 同じ行に並ぶ 2 つを上下で分けないよう、重なりが大きいときは左右で比べる */
function compareReadingOrder(a: OcrLine, b: OcrLine): number {
  if (!a.bbox || !b.bbox) return 0
  const overlap = Math.min(a.bbox.y1, b.bbox.y1) - Math.max(a.bbox.y0, b.bbox.y0)
  const shorter = Math.min(a.bbox.y1 - a.bbox.y0, b.bbox.y1 - b.bbox.y0)
  if (overlap > shorter / 2) return a.bbox.x0 - b.bbox.x0
  return a.bbox.y0 - b.bbox.y0
}
