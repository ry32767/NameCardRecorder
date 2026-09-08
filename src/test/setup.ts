import '@testing-library/jest-dom/vitest'
import { afterAll, afterEach, beforeAll } from 'vitest'
import { cleanup } from '@testing-library/react'
import { server } from './server'

// MSW を全テスト共通で立てる。ハンドラを登録していないリクエストは
// 明示的にエラーにして、テストが本物の GitHub API を叩くのを防ぐ。
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => {
  cleanup()
  server.resetHandlers()
  localStorage.clear()
})
afterAll(() => server.close())

// jsdom は Blob URL を実装していない。画像プレビューの生成・破棄で落ちないよう最小の実装を置く。
if (typeof URL.createObjectURL !== 'function') {
  URL.createObjectURL = () => 'blob:namecard-test'
}
if (typeof URL.revokeObjectURL !== 'function') {
  URL.revokeObjectURL = () => {}
}
