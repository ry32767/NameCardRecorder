import { openDB } from 'idb'
import type { DBSchema, IDBPDatabase } from 'idb'
import type { Card } from '../lib/card/types'

const DB_NAME = 'namecard'
const DB_VERSION = 1

interface NamecardDb extends DBSchema {
  cards: {
    key: number
    value: Card
  }
  meta: {
    key: string
    value: string
  }
}

const META_REPOSITORY = 'repository'
const META_LAST_SYNCED_AT = 'lastSyncedAt'

let dbPromise: Promise<IDBPDatabase<NamecardDb>> | null = null

function getDb(): Promise<IDBPDatabase<NamecardDb>> {
  dbPromise ??= openDB<NamecardDb>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      db.createObjectStore('cards', { keyPath: 'number' })
      db.createObjectStore('meta')
    },
  })
  return dbPromise
}

/** IndexedDB が使えない環境（プライベートモード等）でも一覧以外は動かす */
export function isCacheAvailable(): boolean {
  return typeof indexedDB !== 'undefined'
}

/**
 * キャッシュは「リポジトリ単位」。設定でリポジトリを変えたら捨てる
 * （docs/architecture.md）。他人のデータが混ざらないようにするため。
 */
export async function loadCachedCards(repository: string): Promise<Card[]> {
  if (!isCacheAvailable()) return []
  try {
    const db = await getDb()
    const cachedRepository = await db.get('meta', META_REPOSITORY)
    if (cachedRepository !== repository) {
      await clearCache()
      return []
    }
    return await db.getAll('cards')
  } catch {
    return []
  }
}

/**
 * 取得した名刺をキャッシュに書く。
 *
 * **書けたかどうかを返す。** 呼び出し側は、書けなかったのに最終同期時刻だけ進めて
 * しまわないようにこの戻り値を見る（進めてしまうと、次回は差分しか取りに行かないのに
 * キャッシュには中身が無い、という状態になり名刺が消えたように見える）。
 */
export async function saveCards(repository: string, cards: readonly Card[]): Promise<boolean> {
  if (!isCacheAvailable()) return false
  if (cards.length === 0) return true // 差分が無いのは成功
  try {
    const db = await getDb()
    const tx = db.transaction(['cards', 'meta'], 'readwrite')
    const store = tx.objectStore('cards')
    await Promise.all(cards.map((card) => store.put(card)))
    await tx.objectStore('meta').put(repository, META_REPOSITORY)
    await tx.done
    return true
  } catch {
    // キャッシュは高速化のためだけのもの。書けなくても画面は止めない
    return false
  }
}

export async function getLastSyncedAt(): Promise<string | undefined> {
  if (!isCacheAvailable()) return undefined
  try {
    const db = await getDb()
    return await db.get('meta', META_LAST_SYNCED_AT)
  } catch {
    return undefined
  }
}

export async function setLastSyncedAt(value: string): Promise<void> {
  if (!isCacheAvailable()) return
  try {
    const db = await getDb()
    await db.put('meta', value, META_LAST_SYNCED_AT)
  } catch {
    // 同上
  }
}

export async function clearCache(): Promise<void> {
  if (!isCacheAvailable()) return
  try {
    const db = await getDb()
    const tx = db.transaction(['cards', 'meta'], 'readwrite')
    await tx.objectStore('cards').clear()
    await tx.objectStore('meta').clear()
    await tx.done
  } catch {
    // 同上
  }
}
