import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TEST_SETTINGS, renderWithProviders } from '../test/render'
import { useSettings } from './settingsContext'

// IndexedDB は jsdom に無いので、キャッシュ破棄が呼ばれたかどうかだけを見る
const clearCache = vi.hoisted(() => vi.fn(() => Promise.resolve()))
vi.mock('./db', () => ({ clearCache }))

/** 設定を書き換えるだけの小さな画面 */
function Harness() {
  const { settings, save } = useSettings()
  if (!settings) return null
  return (
    <>
      <button onClick={() => save({ ...settings, showOcrText: !settings.showOcrText })}>
        重ね表示を切り替える
      </button>
      <button onClick={() => save({ ...settings, repository: 'other-user/other-repo' })}>
        リポジトリを変える
      </button>
    </>
  )
}

describe('SettingsProvider', () => {
  beforeEach(() => {
    localStorage.clear()
    clearCache.mockClear()
  })

  it('OCR の設定を変えただけでは、一覧のローカルキャッシュを捨てない', async () => {
    renderWithProviders(<Harness />, { settings: TEST_SETTINGS })
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: '重ね表示を切り替える' }))

    expect(clearCache).not.toHaveBeenCalled()
  })

  it('リポジトリを変えたら、他人のデータになるのでキャッシュを捨てる', async () => {
    renderWithProviders(<Harness />, { settings: TEST_SETTINGS })
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: 'リポジトリを変える' }))

    expect(clearCache).toHaveBeenCalled()
  })
})
