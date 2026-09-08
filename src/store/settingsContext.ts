import { createContext, useContext } from 'react'
import type { Settings } from '../lib/settings'
import type { RepoRef } from '../lib/github/types'

export interface SettingsContextValue {
  settings: Settings | null
  /** 設定が揃っていて GitHub を叩ける状態か */
  repoRef: RepoRef | null
  save: (settings: Settings) => void
  /** トークン・設定・ローカルキャッシュをすべて消す */
  clear: () => Promise<void>
}

export const SettingsContext = createContext<SettingsContextValue | null>(null)

export function useSettings(): SettingsContextValue {
  const value = useContext(SettingsContext)
  if (!value) throw new Error('SettingsProvider の外で useSettings が呼ばれました')
  return value
}
