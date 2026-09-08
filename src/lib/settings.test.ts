import { beforeEach, describe, expect, it } from 'vitest'
import { loadSettings, needsCacheReset, saveSettings } from './settings'
import type { Settings } from './settings'

const STORAGE_KEY = 'namecard.settings.v1'

const SETTINGS: Settings = {
  repository: 'sample-user/namecard-data',
  token: 'ghp_dummy',
  ocrEngine: 'tesseract',
  showOcrText: false,
}

describe('loadSettings', () => {
  beforeEach(() => localStorage.clear())

  it('保存した設定をそのまま読める', () => {
    saveSettings(SETTINGS)
    expect(loadSettings()).toEqual(SETTINGS)
  })

  it('OCR の項目が無い古い設定は、既定（PaddleOCR・重ね表示 ON）として読む', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ repository: 'sample-user/namecard-data', token: 'ghp_dummy' }),
    )

    expect(loadSettings()).toEqual({
      repository: 'sample-user/namecard-data',
      token: 'ghp_dummy',
      ocrEngine: 'paddle',
      showOcrText: true,
    })
  })

  it('Cloud Vision をやめたので、残っている API キーは読んだ時点で端末から消す', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        repository: 'sample-user/namecard-data',
        token: 'ghp_dummy',
        visionApiKey: 'AIza_dummy_key',
      }),
    )

    loadSettings()

    const stored = localStorage.getItem(STORAGE_KEY) ?? ''
    expect(stored).not.toContain('AIza_dummy_key')
    expect(stored).not.toContain('visionApiKey')
    // リポジトリ・トークンは巻き添えで消さない
    expect(loadSettings()?.token).toBe('ghp_dummy')
  })

  it('知らないエンジン名が入っていても既定に倒す', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ repository: 'a/b', token: 't', ocrEngine: 'vision' }),
    )
    expect(loadSettings()?.ocrEngine).toBe('paddle')
  })
})

describe('needsCacheReset', () => {
  it('OCR の設定を変えただけならキャッシュは捨てない', () => {
    // 重ね表示の ON/OFF で一覧のキャッシュと最終同期時刻まで消すと、次の起動で全件取り直しになる
    expect(needsCacheReset(SETTINGS, { ...SETTINGS, showOcrText: true })).toBe(false)
    expect(needsCacheReset(SETTINGS, { ...SETTINGS, ocrEngine: 'paddle' })).toBe(false)
  })

  it('リポジトリかトークンが変わったら捨てる（他人のデータになるため）', () => {
    expect(needsCacheReset(SETTINGS, { ...SETTINGS, repository: 'other/repo' })).toBe(true)
    expect(needsCacheReset(SETTINGS, { ...SETTINGS, token: 'ghp_other' })).toBe(true)
  })

  it('まだ設定が無ければ捨てるものも無い', () => {
    expect(needsCacheReset(null, SETTINGS)).toBe(false)
  })
})
