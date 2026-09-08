import { useRef } from 'react'
import { Button } from './Button'
import { CARD_SIDES, SIDE_LABELS } from '../lib/cardSide'
import type { CardSide } from '../lib/cardSide'
import type { PreparedImage } from '../lib/ocr/image'

interface ImagePickerProps {
  images: Record<CardSide, PreparedImage | null>
  /** 読み取り中の面。どちらも読んでいなければ null */
  readingSide: CardSide | null
  progress: number
  onFile: (side: CardSide, file: File | undefined) => Promise<void>
  onClear: (side: CardSide) => void
}

/**
 * 名刺画像の取り込み。**表と裏で最大 2 枚**まで選べる（裏は任意）。
 * 1 枚だけの登録が普通なので、裏は「必要なら足す」見せ方にする。
 */
export function ImagePicker({ images, readingSide, progress, onFile, onClear }: ImagePickerProps) {
  return (
    <section className="rounded-card border border-rule bg-card p-4 shadow-card sm:p-6">
      <h2 className="text-title font-bold text-ink">名刺の画像</h2>
      <p className="mt-1 text-meta text-ink-faint">
        表だけでも登録できます。画像はこの端末で処理され、あなたの private
        リポジトリにだけ保存されます。
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {CARD_SIDES.map((side) => (
          <ImageSlot
            key={side}
            side={side}
            image={images[side]}
            reading={readingSide === side}
            // 片方を読み取っている間は、もう片方も操作させない（進捗表示が混ざる）
            disabled={readingSide !== null && readingSide !== side}
            progress={progress}
            onFile={onFile}
            onClear={onClear}
          />
        ))}
      </div>
    </section>
  )
}

interface ImageSlotProps {
  side: CardSide
  image: PreparedImage | null
  reading: boolean
  disabled: boolean
  progress: number
  onFile: (side: CardSide, file: File | undefined) => Promise<void>
  onClear: (side: CardSide) => void
}

function ImageSlot({ side, image, reading, disabled, progress, onFile, onClear }: ImageSlotProps) {
  const cameraRef = useRef<HTMLInputElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const label = SIDE_LABELS[side]
  const busy = reading || disabled

  return (
    <div className="rounded-card border border-rule p-3">
      <div className="flex items-baseline justify-between">
        <h3 className="text-base font-bold text-ink">
          {label}
          {side === 'back' ? <span className="ml-1 text-meta text-ink-faint">（任意）</span> : null}
        </h3>
        {image ? (
          <button
            type="button"
            onClick={() => onClear(side)}
            disabled={busy}
            className="min-h-tap rounded-control px-2 text-meta font-bold text-vermilion hover:bg-vermilion-tint disabled:opacity-50"
          >
            {label}を外す
          </button>
        ) : null}
      </div>

      {image ? (
        <img
          src={image.previewUrl}
          alt={`選択した名刺の画像（${label}）`}
          className="mt-2 w-full rounded-card border border-rule object-contain"
        />
      ) : (
        <div className="mt-2 flex aspect-meishi items-center justify-center rounded-card border border-dashed border-rule-strong bg-paper text-meta text-ink-faint">
          未選択
        </div>
      )}

      {reading ? (
        <div className="mt-3">
          <div className="flex items-center justify-between text-meta text-ink-soft">
            <span>{label}を読み取っています…</span>
            <span className="font-mono">{progress}%</span>
          </div>
          <div
            role="progressbar"
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`${label}の OCR の進捗`}
            className="mt-1 h-2 w-full overflow-hidden rounded-control bg-paper"
          >
            <div className="h-full bg-indigo transition-[width]" style={{ width: `${progress}%` }} />
          </div>
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        {/* capture 付きはスマホでカメラが起動する。PC ではファイル選択にフォールバックする */}
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          aria-label={`${label}をカメラで撮影`}
          onChange={(e) => void onFile(side, e.target.files?.[0])}
        />
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="sr-only"
          aria-label={`${label}の画像ファイルを選択`}
          onChange={(e) => void onFile(side, e.target.files?.[0])}
        />
        <Button onClick={() => cameraRef.current?.click()} disabled={busy}>
          カメラで撮影
        </Button>
        <Button onClick={() => fileRef.current?.click()} disabled={busy}>
          画像を選ぶ
        </Button>
      </div>
    </div>
  )
}
