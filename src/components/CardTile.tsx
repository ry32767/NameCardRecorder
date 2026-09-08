import { Link } from 'react-router-dom'
import { edgeColorClass } from '../lib/edgeColor'
import { NAME_PLACEHOLDER } from '../lib/card/serialize'
import type { Card } from '../lib/card/types'

/**
 * 一覧の 1 枚。
 * 日本の標準名刺と同じ 91:55 の比率を保つ（DESIGN.md のシグネチャ / 不変条件 2）。
 * 収まらない情報は truncate する。比率のほうを優先する。
 */
export function CardTile({ card }: { card: Card }) {
  const roleLine = [card.department, card.title].filter(Boolean).join(' ')

  return (
    <Link
      to={`/cards/${card.number}`}
      className="group relative block aspect-meishi overflow-hidden rounded-card border border-rule bg-card p-4 pl-5 shadow-card transition-shadow hover:shadow-lift"
    >
      {/* 小口帯。会社ごとに決まった色（装飾なので読み上げない） */}
      <span aria-hidden="true" className={`edge-bar ${edgeColorClass(card.company)}`} />

      <div className="flex h-full flex-col justify-between">
        <div className="min-w-0">
          <p className="truncate text-meta text-ink-soft">{card.company || '（会社名なし）'}</p>
          <p className="mt-1 truncate font-mincho text-title font-bold text-ink">
            {card.name || NAME_PLACEHOLDER}
          </p>
          {roleLine ? <p className="mt-1 truncate text-meta text-ink-faint">{roleLine}</p> : null}
        </div>

        <p className="flex items-baseline gap-2 text-meta text-ink-faint">
          {card.metOn ? (
            <>
              <span className="sr-only">出会った日</span>
              <time dateTime={card.metOn} className="font-mono">
                {card.metOn}
              </time>
            </>
          ) : null}
          {card.metAt ? <span className="truncate">{card.metAt}</span> : null}
        </p>
      </div>
    </Link>
  )
}
