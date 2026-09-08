import { useId } from 'react'
import type { InputHTMLAttributes, TextareaHTMLAttributes } from 'react'

interface CommonProps {
  label: string
  /** インラインの検証メッセージ。色だけでなく文言でも伝える（DESIGN.md 不変条件 8） */
  error?: string | undefined
  hint?: string | undefined
  /** 電話番号・郵便番号・日付など桁を揃えたい欄 */
  numeric?: boolean
}

type TextFieldProps = CommonProps & Omit<InputHTMLAttributes<HTMLInputElement>, 'id'>

const BASE_INPUT = [
  // 16px を下回らない（iOS の自動ズーム回避。DESIGN.md 不変条件 4）
  'w-full rounded-control border bg-card px-3 py-2 text-base text-ink',
  'min-h-tap placeholder:text-ink-faint',
  'disabled:bg-paper disabled:text-ink-faint',
].join(' ')

function borderClass(hasError: boolean): string {
  return hasError ? 'border-vermilion' : 'border-rule-strong'
}

export function TextField({ label, error, hint, numeric, className = '', ...props }: TextFieldProps) {
  const id = useId()
  const errorId = `${id}-error`
  const hintId = `${id}-hint`

  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1 block text-meta font-bold text-ink-soft">
        {label}
        {props.required ? <span className="ml-1 text-vermilion">（必須）</span> : null}
      </label>
      <input
        id={id}
        {...props}
        aria-invalid={error ? true : undefined}
        aria-describedby={[error ? errorId : null, hint ? hintId : null].filter(Boolean).join(' ') || undefined}
        className={[BASE_INPUT, borderClass(Boolean(error)), numeric ? 'font-mono' : ''].join(' ')}
      />
      {hint ? (
        <p id={hintId} className="mt-1 text-meta text-ink-faint">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} role="alert" className="mt-1 text-meta font-bold text-vermilion">
          {error}
        </p>
      ) : null}
    </div>
  )
}

type TextAreaProps = CommonProps & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'id'>

export function TextArea({ label, error, hint, className = '', ...props }: TextAreaProps) {
  const id = useId()
  const errorId = `${id}-error`

  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1 block text-meta font-bold text-ink-soft">
        {label}
      </label>
      <textarea
        id={id}
        rows={4}
        {...props}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className={[BASE_INPUT, borderClass(Boolean(error)), 'resize-y'].join(' ')}
      />
      {hint ? <p className="mt-1 text-meta text-ink-faint">{hint}</p> : null}
      {error ? (
        <p id={errorId} role="alert" className="mt-1 text-meta font-bold text-vermilion">
          {error}
        </p>
      ) : null}
    </div>
  )
}
