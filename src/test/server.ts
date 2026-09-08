import { setupServer } from 'msw/node'

// 既定のハンドラは置かない。各テストが server.use(...) で必要な応答だけ足す。
export const server = setupServer()
