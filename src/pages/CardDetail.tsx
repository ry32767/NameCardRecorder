import { Link, useParams } from 'react-router-dom'
import { AppHeader } from '../components/AppHeader'
import { CardImage } from '../components/CardImage'
import { NAME_PLACEHOLDER } from '../lib/card/serialize'
import { useSettings } from '../store/settingsContext'
import type { Card } from '../lib/card/types'
import type { CardsState } from '../store/useCards'

export const NOT_FOUND_MESSAGE = '名刺が見つかりません'

export function CardDetail({ cards }: { cards: CardsState }) {
  const { number } = useParams()
  const { repoRef } = useSettings()
  const card = cards.cards.find((item) => String(item.number) === number)

  if (!cards.loaded) {
    return (
      <>
        <AppHeader title="名刺" backTo="/" />
        <main className="mx-auto max-w-2xl px-4 py-10">
          <p className="text-center text-base text-ink-faint">読み込んでいます…</p>
        </main>
      </>
    )
  }

  if (!card) {
    return (
      <>
        <AppHeader title="名刺" backTo="/" />
        <main className="mx-auto max-w-2xl px-4 py-10 text-center">
          <p className="text-base text-ink">{NOT_FOUND_MESSAGE}</p>
          <Link
            to="/"
            className="mt-4 inline-flex min-h-tap items-center rounded-control bg-indigo px-4 text-base font-bold text-white hover:bg-indigo-deep"
          >
            一覧に戻る
          </Link>
        </main>
      </>
    )
  }

  return (
    <>
      <AppHeader title={card.name || NAME_PLACEHOLDER} backTo="/" />

      <main className="mx-auto max-w-2xl px-4 py-4 pb-10">
        <section className="rounded-card border border-rule bg-card p-4 shadow-card sm:p-6">
          <p className="text-base text-ink-soft">{card.company}</p>
          {/* 氏名だけ明朝。実物の名刺に寄せる（DESIGN.md のシグネチャ） */}
          <h2 className="mt-1 font-mincho text-head font-bold text-ink">
            {card.name || NAME_PLACEHOLDER}
          </h2>
          {card.nameKana ? <p className="mt-1 text-meta text-ink-faint">{card.nameKana}</p> : null}
          {card.department || card.title ? (
            <p className="mt-2 text-base text-ink-soft">
              {[card.department, card.title].filter(Boolean).join(' ')}
            </p>
          ) : null}
        </section>

        <section className="mt-4 rounded-card border border-rule bg-card p-4 shadow-card sm:p-6">
          <h3 className="mb-3 text-title font-bold text-ink">連絡先</h3>
          <dl className="space-y-3">
            {/* スマホからそのまま発信・送信できるようにする */}
            <LinkRow label="メール" value={card.email} href={`mailto:${card.email}`} />
            <LinkRow label="電話" value={card.phone} href={`tel:${card.phone}`} numeric />
            <LinkRow label="携帯" value={card.mobile} href={`tel:${card.mobile}`} numeric />
            <Row label="FAX" value={card.fax} numeric />
            <Row label="郵便番号" value={card.postalCode} numeric />
            <Row label="住所" value={card.address} />
            <LinkRow
              label="Web サイト"
              value={card.website}
              href={withScheme(card.website)}
              external
            />
          </dl>
        </section>

        <section className="mt-4 rounded-card border border-rule bg-card p-4 shadow-card sm:p-6">
          <h3 className="mb-3 text-title font-bold text-ink">記録</h3>
          <dl className="space-y-3">
            <Row label="出会った日" value={card.metOn} numeric />
            <Row label="出会った場所" value={card.metAt} />
            <Row label="タグ" value={card.tags.join('、')} />
            <Row label="メモ" value={card.memo} multiline />
          </dl>
        </section>

        {repoRef && (card.image || card.imageBack) ? (
          <section className="mt-4">
            <h3 className="mb-2 text-title font-bold text-ink">名刺画像</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              {card.image ? (
                <figure>
                  <figcaption className="mb-1 text-meta text-ink-faint">表</figcaption>
                  <CardImage repoRef={repoRef} path={card.image} side="表" />
                </figure>
              ) : null}
              {card.imageBack ? (
                <figure>
                  <figcaption className="mb-1 text-meta text-ink-faint">裏</figcaption>
                  <CardImage repoRef={repoRef} path={card.imageBack} side="裏" />
                </figure>
              ) : null}
            </div>
          </section>
        ) : null}

        <p className="mt-6">
          <a
            href={card.htmlUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex min-h-tap items-center rounded-control px-3 text-base font-bold text-indigo hover:bg-indigo-tint"
          >
            GitHub で開く
            <span aria-hidden="true" className="ml-1">
              ↗
            </span>
          </a>
        </p>
      </main>
    </>
  )
}

function withScheme(url: string): string {
  if (!url) return ''
  return /^https?:\/\//i.test(url) ? url : `https://${url}`
}

function Row({
  label,
  value,
  numeric,
  multiline,
}: {
  label: string
  value: string
  numeric?: boolean
  multiline?: boolean
}) {
  if (!value) return null
  return (
    <div className="grid grid-cols-[6.5rem_1fr] gap-3">
      <dt className="text-meta text-ink-faint">{label}</dt>
      <dd
        className={[
          'text-base text-ink',
          numeric ? 'font-mono' : '',
          multiline ? 'whitespace-pre-wrap' : '',
        ].join(' ')}
      >
        {value}
      </dd>
    </div>
  )
}

function LinkRow({
  label,
  value,
  href,
  numeric,
  external,
}: {
  label: string
  value: string
  href: string
  numeric?: boolean
  external?: boolean
}) {
  if (!value) return null
  return (
    <div className="grid grid-cols-[6.5rem_1fr] gap-3">
      <dt className="text-meta text-ink-faint">{label}</dt>
      <dd>
        <a
          href={href}
          {...(external ? { target: '_blank', rel: 'noreferrer noopener' } : {})}
          className={[
            'inline-flex min-h-tap items-center text-base font-bold text-indigo underline underline-offset-2',
            numeric ? 'font-mono' : '',
          ].join(' ')}
        >
          {value}
        </a>
      </dd>
    </div>
  )
}

export type { Card }
