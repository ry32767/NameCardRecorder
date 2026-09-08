import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

// GitHub Pages はサブパス配信なので base を固定する。
// 後から変えるとアセット・Tesseract の worker/lang のパスが全部ズレるため最初から入れている。
export default defineConfig({
  base: '/NameCardRecorder/',
  plugins: [react()],
  // PaddleOCR SDK は dist の中で `new Worker(new URL('./assets/...', import.meta.url))` を
  // 使う。Vite の依存の事前バンドルを通すとこの相対パスが壊れて worker が起動しないので除外する。
  optimizeDeps: {
    exclude: ['@paddleocr/paddleocr-js'],
    // 除外した SDK が読む CJS の依存は、こちらで ESM に変換しておく必要がある
    include: ['clipper-lib', 'js-yaml', '@techstark/opencv-js', 'onnxruntime-web'],
  },
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
