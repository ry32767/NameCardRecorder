import { describe, expect, it } from 'vitest'
import { engineFor, ocrInputBlob } from './engine'
import type { PreparedImage } from './image'
import type { Settings } from '../settings'

const BASE: Settings = {
  repository: 'sample-user/namecard-data',
  token: 'ghp_dummy',
  ocrEngine: 'paddle',
  showOcrText: true,
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
  it('既定は PaddleOCR（設定が無い端末でも同じ）', () => {
    expect(engineFor(BASE)).toBe('paddle')
    expect(engineFor(null)).toBe('paddle')
  })

  it('設定で選んだエンジンをそのまま使う', () => {
    expect(engineFor({ ...BASE, ocrEngine: 'tesseract' })).toBe('tesseract')
  })
})

describe('ocrInputBlob', () => {
  it('Tesseract にはグレースケール強調した方を渡す', () => {
    expect(ocrInputBlob('tesseract', IMAGE)).toBe(IMAGE.ocrBlob)
  })

  it('PaddleOCR には前処理していないカラーの方を渡す', () => {
    expect(ocrInputBlob('paddle', IMAGE)).toBe(IMAGE.storageBlob)
  })
})
