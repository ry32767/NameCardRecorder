import type { ReactNode } from 'react'

type Tone = 'info' | 'success' | 'error'

const TONES: Record<Tone, { box: string; mark: string }> = {
  info: { box: 'border-rule-strong bg-card text-ink-soft', mark: '—' },
  success: { box: 'border-moss bg-moss-tint text-ink', mark: '✓' },
  error: { box: 'border-vermilion bg-vermilion-tint text-ink', mark: '!' },
}

/**
 * 状態を色だけで表さず、記号と文言を必ず添える（DESIGN.md 不変条件 8）。
 * エラーはスクリーンリーダーにも届くよう role="alert" を持つ。
 */
export function Notice({ tone = 'info', children }: { tone?: Tone; children: ReactNode }) {
  const style = TONES[tone]
  return (
    <p
      role={tone === 'error' ? 'alert' : 'status'}
      className={`flex items-start gap-2 rounded-control border px-3 py-2 text-base ${style.box}`}
    >
      <span aria-hidden="true" className="font-mono font-bold">
        {style.mark}
      </span>
      <span>{children}</span>
    </p>
  )
}
