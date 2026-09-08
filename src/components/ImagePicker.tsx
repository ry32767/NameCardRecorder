import { useRef } from 'react'
import { Button } from './Button'
import type { PreparedImage } from '../lib/ocr/image'

interface ImagePickerProps {
  image: PreparedImage | null
  reading: boolean
  progress: number
  onFile: (file: File | undefined) => Promise<void>
}

/** 名刺画像の取り込みと OCR の進捗表示 */
export function ImagePicker({ image, reading, progress, onFile }: ImagePickerProps) {
  const cameraRef = useRef<HTMLInputElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  return (
    <section className="rounded-card border border-rule bg-card p-4 shadow-card sm:p-6">
      <h2 className="text-title font-bold text-ink">名刺の画像</h2>

      {image ? (
        <img
          src={image.previewUrl}
          alt="選択した名刺の画像"
          className="mt-3 w-full rounded-card border border-rule object-contain"
        />
      ) : (
        <p className="mt-2 text-base text-ink-soft">
          カメラで撮るか、画像ファイルを選んでください。画像はこの端末で処理され、
          あなたの private リポジトリにだけ保存されます。
        </p>
      )}

      {reading ? (
        <div className="mt-4">
          <div className="flex items-center justify-between text-meta text-ink-soft">
            <span>文字を読み取っています…</span>
            <span className="font-mono">{progress}%</span>
          </div>
          <div
            role="progressbar"
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="OCR の進捗"
            className="mt-1 h-2 w-full overflow-hidden rounded-control bg-paper"
          >
            <div className="h-full bg-indigo transition-[width]" style={{ width: `${progress}%` }} />
          </div>
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-3">
        {/* capture 付きはスマホでカメラが起動する。PC ではファイル選択にフォールバックする */}
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          aria-label="カメラで撮影"
          onChange={(e) => void onFile(e.target.files?.[0])}
        />
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="sr-only"
          aria-label="画像ファイルを選択"
          onChange={(e) => void onFile(e.target.files?.[0])}
        />
        <Button onClick={() => cameraRef.current?.click()} disabled={reading}>
          カメラで撮影
        </Button>
        <Button onClick={() => fileRef.current?.click()} disabled={reading}>
          画像を選ぶ
        </Button>
      </div>
    </section>
  )
}
