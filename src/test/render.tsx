import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { SettingsProvider } from '../store/SettingsProvider'
import { saveSettings } from '../lib/settings'
import type { ReactElement } from 'react'
import type { Settings } from '../lib/settings'

export const TEST_SETTINGS: Settings = {
  repository: 'sample-user/namecard-data',
  token: 'ghp_testtoken0000',
  visionApiKey: '',
}

/** 設定済み／未設定の両方を同じ書き方で組めるようにする */
export function renderWithProviders(
  ui: ReactElement,
  options: { settings?: Settings; route?: string } = {},
) {
  if (options.settings) saveSettings(options.settings)

  return render(
    <MemoryRouter initialEntries={[options.route ?? '/']}>
      <SettingsProvider>{ui}</SettingsProvider>
    </MemoryRouter>,
  )
}
