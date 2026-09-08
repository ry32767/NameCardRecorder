import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

// GitHub Pages はサブパス配信なので base を固定する。
// 後から変えるとアセット・Tesseract の worker/lang のパスが全部ズレるため最初から入れている。
export default defineConfig({
  base: '/NameCardRecorder/',
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
})
