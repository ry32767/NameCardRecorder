import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AppHeader } from '../components/AppHeader'
import { CardTile } from '../components/CardTile'
import { Notice } from '../components/Notice'
import { buildSearchIndex, collectFacets, filterCards, isFilterActive } from '../lib/search'
import { CARD_SORT_OPTIONS, DEFAULT_SORT, isCardSortKey, sortCardsBy } from '../lib/sort'
import { visibleCards } from '../store/merge'
import type { CardFilter } from '../lib/search'
import type { CardSortKey } from '../lib/sort'
import type { CardsState } from '../store/useCards'

export const EMPTY_MESSAGE = 'まだ名刺がありません。「+ 名刺を追加」から登録しましょう'
export const NO_RESULT_MESSAGE = '該当する名刺がありません'

export function CardList({ cards }: { cards: CardsState }) {
  const [filter, setFilter] = useState<CardFilter>({})
  const [sort, setSort] = useState<CardSortKey>(DEFAULT_SORT)

  const open = useMemo(() => visibleCards(cards.cards), [cards.cards])
  // 正規化はキーを打つたびではなく一覧が変わったときだけ行う（500 件でも 1 秒以内に収める）
  const index = useMemo(() => buildSearchIndex(open), [open])
  const facets = useMemo(() => collectFacets(open), [open])
  // 並べ替えは絞り込みの後に掛ける（絞り込んだ結果の中での順序を選んでいるため）
  const results = useMemo(
    () => sortCardsBy(filterCards(index, filter), sort),
    [index, filter, sort],
  )

  const filtering = isFilterActive(filter)

  return (
    <>
      <AppHeader
        title="名刺"
        actions={
          <>
            <Link
              to="/settings"
              aria-label="設定"
              title="設定"
              className="flex min-h-tap min-w-tap items-center justify-center rounded-control text-title text-ink-soft hover:bg-indigo-tint hover:text-indigo"
            >
              <span aria-hidden="true">⚙</span>
            </Link>
            <Link
              to="/new"
              className="hidden min-h-tap items-center rounded-control bg-indigo px-4 text-base font-bold text-white hover:bg-indigo-deep sm:inline-flex"
            >
              + 名刺を追加
            </Link>
          </>
        }
      />

      <main className="mx-auto max-w-5xl px-4 py-4 pb-24 sm:pb-8">
        <div className="space-y-3">
          <label className="block">
            <span className="sr-only">名刺を検索</span>
            <input
              type="search"
              inputMode="search"
              placeholder="氏名・会社・部署・メモで検索"
              value={filter.query ?? ''}
              onChange={(event) => setFilter((f) => ({ ...f, query: event.target.value }))}
              className="min-h-tap w-full rounded-control border border-rule-strong bg-card px-3 py-2 text-base text-ink placeholder:text-ink-faint"
            />
          </label>

          <FacetRow
            label="会社"
            options={facets.companies}
            selected={filter.company}
            onSelect={(value) => setFilter((f) => ({ ...f, company: value }))}
          />
          <FacetRow
            label="出会った場所"
            options={facets.events}
            selected={filter.event}
            onSelect={(value) => setFilter((f) => ({ ...f, event: value }))}
          />
          <FacetRow
            label="タグ"
            options={facets.tags}
            selected={filter.tag}
            onSelect={(value) => setFilter((f) => ({ ...f, tag: value }))}
          />

          <div className="flex flex-wrap items-center gap-2">
            {/* 項目と向きを 1 つの select にまとめる。iOS で拡大されないよう文字は 16px 以上 */}
            <label className="flex items-center gap-2">
              <span className="shrink-0 text-meta font-bold text-ink-faint">並び順</span>
              <select
                value={sort}
                onChange={(event) => {
                  const next = event.target.value
                  if (isCardSortKey(next)) setSort(next)
                }}
                className="min-h-tap rounded-control border border-rule-strong bg-card px-2 text-base text-ink"
              >
                {CARD_SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            {filtering ? (
              <button
                type="button"
                onClick={() => setFilter({})}
                className="min-h-tap rounded-control px-3 text-base font-bold text-indigo hover:bg-indigo-tint"
              >
                絞り込みをクリア
              </button>
            ) : null}
          </div>
        </div>

        <div className="mt-4 space-y-3">
          {cards.syncState === 'offline' ? (
            <Notice tone="info">{cards.errorMessage}</Notice>
          ) : null}
          {cards.syncState === 'error' && cards.errorMessage ? (
            <Notice tone="error">{cards.errorMessage}</Notice>
          ) : null}
        </div>

        {!cards.loaded ? (
          <p className="mt-10 text-center text-base text-ink-faint">読み込んでいます…</p>
        ) : open.length === 0 ? (
          <EmptyState />
        ) : results.length === 0 ? (
          <p className="mt-10 text-center text-base text-ink-soft">{NO_RESULT_MESSAGE}</p>
        ) : (
          <>
            <p className="mt-5 text-meta text-ink-faint">
              <span className="font-mono">{results.length}</span> 件
              {cards.syncState === 'syncing' ? '（同期中…）' : null}
            </p>
            <ul className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {results.map((card) => (
                <li key={card.number}>
                  <CardTile card={card} />
                </li>
              ))}
            </ul>
          </>
        )}
      </main>

      {/* スマホでは主アクションを親指の届く画面下に固定する */}
      <div className="fixed inset-x-0 bottom-0 border-t border-rule bg-paper/95 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur sm:hidden">
        <Link
          to="/new"
          className="flex min-h-tap w-full items-center justify-center rounded-control bg-indigo text-base font-bold text-white hover:bg-indigo-deep"
        >
          + 名刺を追加
        </Link>
      </div>
    </>
  )
}

function EmptyState() {
  return (
    <div className="mt-10 rounded-card border border-dashed border-rule-strong bg-card p-8 text-center">
      <p className="text-base text-ink-soft">{EMPTY_MESSAGE}</p>
      <Link
        to="/new"
        className="mt-4 inline-flex min-h-tap items-center rounded-control bg-indigo px-4 text-base font-bold text-white hover:bg-indigo-deep"
      >
        + 名刺を追加
      </Link>
    </div>
  )
}

interface FacetRowProps {
  label: string
  options: { value: string; count: number }[]
  selected: string | undefined
  onSelect: (value: string | undefined) => void
}

function FacetRow({ label, options, selected, onSelect }: FacetRowProps) {
  if (options.length === 0) return null

  return (
    <div className="flex items-start gap-2">
      <span className="mt-2 shrink-0 text-meta font-bold text-ink-faint">{label}</span>
      {/* 狭い画面では横スクロールで逃がす。ページ全体を横スクロールさせない */}
      <div className="-mx-1 flex flex-1 gap-2 overflow-x-auto px-1 py-1">
        {options.map((option) => {
          const active = selected === option.value
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={active}
              onClick={() => onSelect(active ? undefined : option.value)}
              className={[
                'min-h-tap shrink-0 rounded-control border px-3 text-meta font-bold transition-colors',
                active
                  ? 'border-indigo bg-indigo text-white'
                  : 'border-rule-strong bg-card text-ink-soft hover:bg-indigo-tint',
              ].join(' ')}
            >
              {option.value}
              <span className="ml-1 font-mono font-normal opacity-80">{option.count}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
