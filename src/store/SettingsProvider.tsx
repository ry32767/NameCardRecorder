import { useCallback, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { clearSettings, loadSettings, needsCacheReset, saveSettings, toRepoRef } from '../lib/settings'
import { clearBranchCache } from '../lib/github/createCard'
import { clearCache } from './db'
import { SettingsContext } from './settingsContext'
import type { Settings } from '../lib/settings'

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings | null>(() => loadSettings())

  // 直前の設定。副作用（キャッシュ破棄）の判断を、state 更新関数の外で行うために持つ
  const previousRef = useRef<Settings | null>(settings)

  const save = useCallback((next: Settings) => {
    saveSettings(next)
    // リポジトリ・トークンを変えたときだけ、キャッシュは他人のデータになるので捨てる。
    // OCR の設定はここから外す（重ね表示の ON/OFF で一覧のキャッシュを消さない）
    if (needsCacheReset(previousRef.current, next)) {
      void clearCache()
      clearBranchCache()
    }
    previousRef.current = next
    setSettings(next)
  }, [])

  const clear = useCallback(async () => {
    clearSettings()
    clearBranchCache()
    await clearCache()
    previousRef.current = null
    setSettings(null)
  }, [])

  const value = useMemo(
    () => ({ settings, repoRef: settings ? toRepoRef(settings) : null, save, clear }),
    [settings, save, clear],
  )

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
}
