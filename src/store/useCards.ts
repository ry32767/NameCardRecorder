import { useCallback, useEffect, useRef, useState } from 'react'
import { listCardIssues } from '../lib/github/issues'
import { cardFromIssue } from '../lib/card/card'
import { GithubError } from '../lib/github/errors'
import { getLastSyncedAt, loadCachedCards, saveCards, setLastSyncedAt } from './db'
import { mergeCards, sortCards } from './merge'
import type { Card } from '../lib/card/types'
import type { RepoRef } from '../lib/github/types'

export const OFFLINE_MESSAGE = 'オフラインです（最新でない可能性があります）'

export type SyncState = 'idle' | 'syncing' | 'synced' | 'offline' | 'error'

export interface CardsState {
  cards: Card[]
  /** キャッシュの読み込みが済むまでは一覧を「空」と判断しない */
  loaded: boolean
  syncState: SyncState
  errorMessage: string | null
  refresh: () => void
  /** 登録直後にキャッシュと画面へ即座に反映する（再取得を待たない） */
  addCard: (card: Card) => void
}

export function useCards(repoRef: RepoRef | null): CardsState {
  const [cards, setCards] = useState<Card[]>([])
  const [loaded, setLoaded] = useState(false)
  const [syncState, setSyncState] = useState<SyncState>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [refreshToken, setRefreshToken] = useState(0)

  // 同期の結果が、設定変更後の古いリクエストで上書きされないようにする
  const requestIdRef = useRef(0)

  const repository = repoRef ? `${repoRef.owner}/${repoRef.repo}` : null

  useEffect(() => {
    if (!repoRef || !repository) {
      setCards([])
      setLoaded(true)
      setSyncState('idle')
      return
    }

    const requestId = ++requestIdRef.current
    let cancelled = false

    async function run(ref: RepoRef, repositoryKey: string) {
      // 1. まずキャッシュを描く（通信を待たない・オフラインでも見える）
      const cached = await loadCachedCards(repositoryKey)
      if (cancelled || requestId !== requestIdRef.current) return
      setCards(sortCards(cached))
      setLoaded(true)

      // 2. 差分だけ取りに行く
      setSyncState('syncing')
      setErrorMessage(null)
      const since = cached.length > 0 ? await getLastSyncedAt() : undefined
      const startedAt = new Date().toISOString()

      try {
        const issues = await listCardIssues(ref, since ? { since } : {})
        if (cancelled || requestId !== requestIdRef.current) return

        const fetched = issues.map(cardFromIssue)
        setCards((current) => mergeCards(current, fetched))

        // キャッシュに書けたときだけ最終同期時刻を進める。
        // 書けていないのに進めると、次回は差分しか取りに行かないのにキャッシュは空、
        // という状態になって名刺が消えたように見える。
        const persisted = await saveCards(repositoryKey, fetched)
        if (persisted) await setLastSyncedAt(startedAt)

        if (cancelled || requestId !== requestIdRef.current) return
        setSyncState('synced')
      } catch (error) {
        if (cancelled || requestId !== requestIdRef.current) return
        const offline = !navigator.onLine || (error instanceof GithubError && error.kind === 'network')
        setSyncState(offline ? 'offline' : 'error')
        setErrorMessage(
          offline
            ? OFFLINE_MESSAGE
            : error instanceof Error
              ? error.message
              : '一覧の取得に失敗しました',
        )
      }
    }

    void run(repoRef, repository)
    return () => {
      cancelled = true
    }
    // repoRef はオブジェクトなので、実体が変わる repository とトークンで依存を張る
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repository, repoRef?.token, refreshToken])

  const refresh = useCallback(() => setRefreshToken((value) => value + 1), [])

  const addCard = useCallback(
    (card: Card) => {
      setCards((current) => mergeCards(current, [card]))
      if (repository) void saveCards(repository, [card])
    },
    [repository],
  )

  return { cards, loaded, syncState, errorMessage, refresh, addCard }
}
