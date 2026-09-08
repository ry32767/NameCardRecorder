import { useCallback, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { clearSettings, loadSettings, saveSettings, toRepoRef } from '../lib/settings'
import { clearBranchCache } from '../lib/github/createCard'
import { clearCache } from './db'
import { SettingsContext } from './settingsContext'
import type { Settings } from '../lib/settings'

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings | null>(() => loadSettings())

  const save = useCallback((next: Settings) => {
    saveSettings(next)
    // リポジトリを変えたらキャッシュは他人のデータになるので捨てる
    void clearCache()
    clearBranchCache()
    setSettings(next)
  }, [])

  const clear = useCallback(async () => {
    clearSettings()
    clearBranchCache()
    await clearCache()
    setSettings(null)
  }, [])

  const value = useMemo(
    () => ({ settings, repoRef: settings ? toRepoRef(settings) : null, save, clear }),
    [settings, save, clear],
  )

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
}
