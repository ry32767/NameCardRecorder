import type { ButtonHTMLAttributes, ReactNode } from 'react'

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  children: ReactNode
}

// 色・角丸・余白はすべて tailwind.config.js のトークンから引く（DESIGN.md 不変条件 1）
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-indigo text-white hover:bg-indigo-deep active:bg-indigo-deep',
  secondary: 'bg-card text-ink border border-rule-strong hover:bg-paper',
  // 破壊的操作にだけ朱を使う。前向きな主アクションには使わない
  danger: 'bg-card text-vermilion border border-vermilion hover:bg-vermilion-tint',
  ghost: 'bg-transparent text-indigo hover:bg-indigo-tint',
}

export function Button({ variant = 'secondary', className = '', ...props }: ButtonProps) {
  return (
    <button
      type="button"
      {...props}
      className={[
        // タップ領域 44px 以上（DESIGN.md 不変条件 3）
        'inline-flex min-h-tap min-w-tap items-center justify-center gap-2 rounded-control px-4 py-2',
        'text-base font-bold transition-colors',
        'disabled:cursor-not-allowed disabled:opacity-50',
        VARIANTS[variant],
        className,
      ].join(' ')}
    />
  )
}
