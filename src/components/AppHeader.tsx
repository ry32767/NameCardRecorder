import { Link } from 'react-router-dom'
import type { ReactNode } from 'react'

interface AppHeaderProps {
  title: string
  /** 一覧以外の画面では「戻る」を必ず出す（非常口） */
  backTo?: string
  backLabel?: string
  actions?: ReactNode
}

export function AppHeader({ title, backTo, backLabel = '一覧に戻る', actions }: AppHeaderProps) {
  return (
    <header className="sticky top-0 z-10 border-b border-rule bg-paper/95 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
        {backTo ? (
          <Link
            to={backTo}
            className="-ml-2 flex min-h-tap min-w-tap items-center justify-center rounded-control px-2 text-base font-bold text-indigo hover:bg-indigo-tint"
          >
            <span aria-hidden="true" className="mr-1">
              ←
            </span>
            <span className="sr-only sm:not-sr-only">{backLabel}</span>
          </Link>
        ) : null}

        <h1 className="min-w-0 flex-1 truncate text-head font-bold text-ink">{title}</h1>

        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </div>
    </header>
  )
}
