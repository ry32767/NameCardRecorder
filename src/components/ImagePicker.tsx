import { useRef } from 'react'
import { Button } from './Button'
import { OcrOverlay } from './OcrOverlay'
import { CARD_SIDES, SIDE_LABELS, otherSide } from '../lib/cardSide'
import type { OverlayLine } from '../lib/ocr/overlay'
import type { CardSide } from '../lib/cardSide'
import type { PreparedImage } from '../lib/ocr/image'

interface ImagePickerProps {
  images: Record<CardSide, PreparedImage | null>
  /** 面ごとの、画像に重ねる読み取り結果 */
  overlays: Record<CardSide, OverlayLine[]>
  /** いま表にしている面 */
  side: CardSide
  onFlip: () => void
  /** 読み取り中の面。どちらも読んでいなければ null */
  readingSide: CardSide | null
  progress: number
  onFile: (side: CardSide, file: File | undefined) => Promise<void>
  onClear: (side: CardSide) => void
  onCopy: (text: string) => void
}

/**
 * 名刺画像の取り込み。**表と裏で最大 2 枚**まで選べる（裏は任意）。
 * 1 枚のカードを裏返して使う見せ方にして、画面には常に片面だけを出す。
 */
export function ImagePicker({
  images,
  overlays,
  side,
  onFlip,
  readingSide,
  progress,
  onFile,
  onClear,
  onCopy,
}: ImagePickerProps) {
  const cameraRef = useRef<HTMLInputElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const label = SIDE_LABELS[side]
  const image = images[side]
  const reading = readingSide !== null
  const readingThis = readingSide === side

  return (
    <section className="rounded-card border border-rule bg-card p-4 shadow-card sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-title font-bold text-ink">
          名刺の画像
          <span className="ml-2 text-meta font-normal text-ink-faint">{label}</span>
          {side === 'back' ? (
            <span className="ml-1 text-meta font-normal text-ink-faint">（任意）</span>
          ) : null}
        </h2>
        {/* 面の切り替えは常に出す。裏がまだ無くても、裏を撮るにはここから行く */}
        <Button onClick={onFlip} disabled={reading}>
          {SIDE_LABELS[otherSide(side)]}を見る
        </Button>
      </div>

      <p className="mt-1 text-meta text-ink-faint">
        {side === 'front'
          ? '表だけでも登録できます。読み取った文字は画像の上に出るので、押すとコピーできます。'
          : '裏の文字はフォームには入れず、あとで見返せるように名刺の記録に残します。'}
      </p>

      {/* 画像そのものを押すと裏返る。文字の上を押したときはコピーが優先される */}
      <div
        className="relative mt-3 overflow-hidden rounded-card border border-rule"
        onClick={onFlip}
        title={`押すと${SIDE_LABELS[otherSide(side)]}に切り替わります`}
      >
        {image ? (
          <>
            <img
              src={image.previewUrl}
              alt={`選択した名刺の画像（${label}）`}
              className="block w-full object-contain"
            />
            <OcrOverlay
              lines={overlays[side]}
              width={image.width}
              height={image.height}
              onCopy={onCopy}
            />
          </>
        ) : (
          <div className="flex aspect-meishi items-center justify-center bg-paper text-meta text-ink-faint">
            {label}は未選択
          </div>
        )}
      </div>

      {readingThis ? (
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
        <Button onClick={() => cameraRef.current?.click()} disabled={reading}>
          カメラで撮影
        </Button>
        <Button onClick={() => fileRef.current?.click()} disabled={reading}>
          画像を選ぶ
        </Button>
        {image ? (
          <Button variant="danger" onClick={() => onClear(side)} disabled={reading}>
            {label}を外す
          </Button>
        ) : null}
      </div>

      {/* どちらの面が入っているかは、裏返さなくても分かるようにする */}
      <p className="mt-3 text-meta text-ink-faint">
        {CARD_SIDES.map((each) => `${SIDE_LABELS[each]}: ${images[each] ? '選択済み' : '未選択'}`).join(
          ' / ',
        )}
      </p>
    </section>
  )
}
