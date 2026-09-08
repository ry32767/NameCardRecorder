import { describe, expect, it } from 'vitest'
import { engineFor, ocrInputBlob } from './engine'
import type { PreparedImage } from './image'
import type { Settings } from '../settings'

const BASE: Settings = {
  repository: 'sample-user/namecard-data',
  token: 'ghp_dummy',
  visionApiKey: '',
}

const IMAGE = {
  storageBlob: new Blob(['storage']),
  storageBase64: '',
  previewUrl: 'blob:x',
  ocrBlob: new Blob(['ocr']),
  width: 1600,
  height: 967,
} satisfies PreparedImage

describe('engineFor', () => {
  it('既定はブラウザ内の Tesseract（画像を外に出さない）', () => {
    expect(engineFor(BASE)).toBe('tesseract')
    expect(engineFor(null)).toBe('tesseract')
  })

  it('API キーが入っているときだけ Cloud Vision を使う', () => {
    expect(engineFor({ ...BASE, visionApiKey: 'AIza_dummy' })).toBe('vision')
  })
})

describe('ocrInputBlob', () => {
  it('Tesseract にはグレースケール強調した方を渡す', () => {
    expect(ocrInputBlob('tesseract', IMAGE)).toBe(IMAGE.ocrBlob)
  })

  it('Vision には前処理していないカラーの方を渡す', () => {
    expect(ocrInputBlob('vision', IMAGE)).toBe(IMAGE.storageBlob)
  })
})
