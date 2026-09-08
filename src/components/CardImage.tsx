import { useEffect, useState } from 'react'
import { fetchFileBlob } from '../lib/github/contents'
import type { RepoRef } from '../lib/github/types'

/**
 * private リポジトリの名刺画像を、トークン付きで取得して表示する。
 * タップで拡大（DESIGN.md の対象画面インベントリ / docs/spec.md 機能4）。
 */
export function CardImage({
  repoRef,
  path,
  side,
}: {
  repoRef: RepoRef
  path: string
  /** 「表」「裏」。読み上げと拡大表示のラベルに使う */
  side: string
}) {
  const [url, setUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const [zoomed, setZoomed] = useState(false)

  useEffect(() => {
    let objectUrl: string | null = null
    let cancelled = false

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

  // Esc で拡大表示を閉じられるようにする（非常口）
  useEffect(() => {
    if (!zoomed) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setZoomed(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [zoomed])

  if (failed) {
    return <p className="text-meta text-ink-faint">名刺画像を読み込めませんでした</p>
  }

  if (!url) {
    return (
      <div className="aspect-meishi w-full animate-pulse rounded-card border border-rule bg-paper" />
    )
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setZoomed(true)}
        className="block w-full rounded-card border border-rule bg-card p-1"
        aria-label={`名刺画像（${side}）を拡大する`}
      >
        <img src={url} alt={`登録した名刺の画像（${side}）`} className="w-full rounded-card object-contain" />
      </button>

      {zoomed ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`名刺画像（${side}）の拡大表示`}
          className="fixed inset-0 z-20 flex items-center justify-center bg-ink/90 p-4"
          onClick={() => setZoomed(false)}
        >
          <img src={url} alt={`登録した名刺の画像（${side}・拡大）`} className="max-h-full max-w-full" />
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
