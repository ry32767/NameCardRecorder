import { useEffect, useState } from 'react'
import { Button } from './Button'
import { fetchFileBlob } from '../lib/github/contents'
import { SIDE_LABELS, otherSide } from '../lib/cardSide'
import type { CardSide } from '../lib/cardSide'
import type { RepoRef } from '../lib/github/types'

/**
 * private リポジトリの名刺画像を、トークン付きで取得して表示する。
 *
 * **画面に出すのは常に片面だけ**で、カードを押すと裏返る（実物の名刺と同じ扱い）。
 * 拡大は別のボタンに分けた。押す＝裏返す、が優先なので、拡大まで同じ操作に載せると
 * どちらが起きるか分からなくなる。
 */
export function CardImages({
  repoRef,
  image,
  imageBack,
}: {
  repoRef: RepoRef
  image: string
  imageBack: string
}) {
  const [side, setSide] = useState<CardSide>(image ? 'front' : 'back')
  const [zoomed, setZoomed] = useState(false)

  const front = useImageUrl(repoRef, image)
  const back = useImageUrl(repoRef, imageBack)
  const both = Boolean(image && imageBack)

  const current = side === 'front' ? front : back
  const label = SIDE_LABELS[side]

  // Esc で拡大表示を閉じられるようにする（非常口）
  useEffect(() => {
    if (!zoomed) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setZoomed(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [zoomed])

  function flip() {
    if (both) setSide(otherSide(side))
  }

  return (
    <>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-title font-bold text-ink">
          名刺画像
          <span className="ml-2 text-meta font-normal text-ink-faint">{label}</span>
        </h3>
        <div className="flex gap-2">
          {both ? <Button onClick={flip}>{SIDE_LABELS[otherSide(side)]}を見る</Button> : null}
          <Button onClick={() => setZoomed(true)} disabled={!current.url}>
            拡大
          </Button>
        </div>
      </div>

      <div
        className="mt-2 max-w-md overflow-hidden rounded-card border border-rule bg-card"
        onClick={flip}
        title={both ? `押すと${SIDE_LABELS[otherSide(side)]}に切り替わります` : undefined}
      >
        {current.failed ? (
          <p className="p-4 text-meta text-ink-faint">名刺画像を読み込めませんでした</p>
        ) : current.url ? (
          <img
            src={current.url}
            alt={`登録した名刺の画像（${label}）`}
            className="block w-full object-contain"
          />
        ) : (
          <div className="aspect-meishi w-full animate-pulse bg-paper" />
        )}
      </div>

      {zoomed && current.url ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`名刺画像（${label}）の拡大表示`}
          className="fixed inset-0 z-20 flex items-center justify-center bg-ink/90 p-4"
          onClick={() => setZoomed(false)}
        >
          <img
            src={current.url}
            alt={`登録した名刺の画像（${label}・拡大）`}
            className="max-h-full max-w-full"
          />
          <button
            type="button"
            onClick={() => setZoomed(false)}
            className="absolute right-4 top-4 min-h-tap min-w-tap rounded-control bg-card px-3 text-base font-bold text-ink"
          >
            閉じる
          </button>
        </div>
      ) : null}
    </>
  )
}

/** パスが空なら何も取りに行かない（裏が無い名刺の方が普通） */
function useImageUrl(repoRef: RepoRef, path: string) {
  const [url, setUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!path) return
    let objectUrl: string | null = null
    let cancelled = false

    setUrl(null)
    setFailed(false)
    fetchFileBlob(repoRef, path)
      .then((blob) => {
        if (cancelled) return
        objectUrl = URL.createObjectURL(blob)
        setUrl(objectUrl)
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })

    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [repoRef, path])

  return { url, failed }
}
