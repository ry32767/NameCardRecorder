export const NOT_AN_IMAGE_MESSAGE = '画像ファイルを選んでください'
export const UNSUPPORTED_IMAGE_MESSAGE = 'この形式の画像は読み込めません'

/** 保存する画像の長辺（docs/architecture.md） */
export const STORAGE_MAX_EDGE = 1600
export const STORAGE_QUALITY = 0.8

export class ImageLoadError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ImageLoadError'
  }
}

/** 拡張子ではなく MIME で判定する。空の type は拡張子で補う */
export function isImageFile(file: File): boolean {
  if (file.type) return file.type.startsWith('image/')
  return /\.(jpe?g|png|gif|webp|bmp|heic|heif|avif)$/i.test(file.name)
}

/**
 * 画像を読み込む。
 * EXIF の向きは `imageOrientation: 'from-image'` に任せる。
 * canvas に素で描くと EXIF が効かず、スマホの縦持ち写真が横倒しになる
 * （docs/spec.md 機能1 の受け入れ条件）。
 */
export async function loadImageBitmap(file: File): Promise<ImageBitmap> {
  if (!isImageFile(file)) throw new ImageLoadError(NOT_AN_IMAGE_MESSAGE)

  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    // HEIC など、そのブラウザがデコードできない形式はここに来る
    try {
      return await createImageBitmap(file)
    } catch {
      throw new ImageLoadError(UNSUPPORTED_IMAGE_MESSAGE)
    }
  }
}

function fitSize(width: number, height: number, maxEdge: number): { width: number; height: number } {
  const longest = Math.max(width, height)
  if (longest <= maxEdge) return { width, height }
  const scale = maxEdge / longest
  return { width: Math.round(width * scale), height: Math.round(height * scale) }
}

function drawTo(bitmap: ImageBitmap, maxEdge: number): HTMLCanvasElement {
  const { width, height } = fitSize(bitmap.width, bitmap.height, maxEdge)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new ImageLoadError(UNSUPPORTED_IMAGE_MESSAGE)
  context.drawImage(bitmap, 0, 0, width, height)
  return canvas
}

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new ImageLoadError(UNSUPPORTED_IMAGE_MESSAGE))),
      'image/jpeg',
      quality,
    )
  })
}

export interface PreparedImage {
  /** リポジトリにコミットする JPEG（長辺 1600px 以下） */
  storageBlob: Blob
  /** Contents API に渡す base64（データ URL のプレフィックスなし） */
  storageBase64: string
  /** 画面プレビュー用。使い終わったら revokeObjectURL する */
  previewUrl: string
  /** OCR にかける前処理済み画像（グレースケール＋コントラスト強調） */
  ocrBlob: Blob
  width: number
  height: number
}

/**
 * 保存用と OCR 用の 2 枚を作る。
 * OCR 用は Tesseract が小さい文字と低コントラストに弱いので、
 * グレースケール化とコントラスト強調をかける（docs/architecture.md）。
 */
export async function prepareImage(file: File): Promise<PreparedImage> {
  const bitmap = await loadImageBitmap(file)
  try {
    const storageCanvas = drawTo(bitmap, STORAGE_MAX_EDGE)
    const storageBlob = await toBlob(storageCanvas, STORAGE_QUALITY)

    const ocrCanvas = drawTo(bitmap, STORAGE_MAX_EDGE)
    applyGrayscaleContrast(ocrCanvas)
    const ocrBlob = await toBlob(ocrCanvas, 0.95)

    return {
      storageBlob,
      storageBase64: await blobToBase64(storageBlob),
      previewUrl: URL.createObjectURL(storageBlob),
      ocrBlob,
      width: storageCanvas.width,
      height: storageCanvas.height,
    }
  } finally {
    bitmap.close()
  }
}

/** グレースケール化してから、中間調を押し広げる */
export function applyGrayscaleContrast(canvas: HTMLCanvasElement, contrast = 1.35): void {
  const context = canvas.getContext('2d')
  if (!context) return
  const image = context.getImageData(0, 0, canvas.width, canvas.height)
  const data = image.data

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i] ?? 0
    const g = data[i + 1] ?? 0
    const b = data[i + 2] ?? 0
    // 輝度（ITU-R BT.601）
    const gray = 0.299 * r + 0.587 * g + 0.114 * b
    const adjusted = clamp((gray - 128) * contrast + 128)
    data[i] = adjusted
    data[i + 1] = adjusted
    data[i + 2] = adjusted
  }

  context.putImageData(image, 0, 0)
}

function clamp(value: number): number {
  return value < 0 ? 0 : value > 255 ? 255 : Math.round(value)
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new ImageLoadError(UNSUPPORTED_IMAGE_MESSAGE))
    reader.onload = () => {
      const result = reader.result
      if (typeof result !== 'string') {
        reject(new ImageLoadError(UNSUPPORTED_IMAGE_MESSAGE))
        return
      }
      // "data:image/jpeg;base64,XXXX" の XXXX だけを返す
      const comma = result.indexOf(',')
      resolve(comma === -1 ? result : result.slice(comma + 1))
    }
    reader.readAsDataURL(blob)
  })
}
