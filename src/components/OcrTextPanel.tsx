import { useEffect, useRef, useState } from 'react'
import { copyText } from '../lib/clipboard'

export interface OcrSection {
  /** 「表」「裏」 */
  label: string
  lines: string[]
}

export const COPIED_MESSAGE = 'コピーしました'
export const COPY_FAILED_MESSAGE = 'コピーできませんでした。下の欄から手で選択してください'

/**
 * 読み取った文字を**行ごとにコピーできる**形で見せるパネル。
 *
 * 氏名や会社名を自動でどの欄に入れるかは推測になり、間違うと消して直す手間が増える。
 * そこで振り分けはやめ、「読めた行をそのまま貼れる」ことだけに絞っている
 * （docs/spec.md 機能2）。
 */
export function OcrTextPanel({ sections }: { sections: OcrSection[] }) {
  const [copied, setCopied] = useState<string | null>(null)
  const [failedText, setFailedText] = useState<string | null>(null)
  const fallbackRef = useRef<HTMLInputElement>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  // コピーに失敗したときは、手で選択できる欄を出して中身を選択しておく
  useEffect(() => {
    if (failedText && fallbackRef.current) {
      fallbackRef.current.focus()
      fallbackRef.current.select()
    }
  }, [failedText])

  const usable = sections.filter((section) => section.lines.length > 0)
  if (usable.length === 0) return null

  async function handleCopy(line: string) {
    const ok = await copyText(line)
    if (!ok) {
      setFailedText(line)
      setCopied(null)
      return
    }
    setFailedText(null)
    setCopied(line)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setCopied(null), 2000)
  }

  return (
    <section className="rounded-card border border-rule bg-card p-4 shadow-card sm:p-6">
      <h2 className="text-title font-bold text-ink">読み取った文字</h2>
      <p className="mt-1 text-meta text-ink-faint">
        行をタップするとコピーできます。下のフォームに貼り付けてください。
      </p>

      {usable.map((section) => (
        <div key={section.label} className="mt-4">
          <h3 className="mb-2 text-meta font-bold text-ink-soft">{section.label}</h3>
          <ul className="space-y-1">
            {section.lines.map((line, index) => (
              <li key={`${section.label}-${index}-${line}`}>
                <button
                  type="button"
                  onClick={() => void handleCopy(line)}
                  className="flex min-h-tap w-full items-center justify-between gap-3 rounded-control border border-rule bg-paper px-3 py-2 text-left text-base text-ink hover:border-indigo hover:bg-indigo-tint"
                >
                  <span className="min-w-0 break-words">{line}</span>
                  <span
                    aria-hidden="true"
                    className="shrink-0 text-meta font-bold text-indigo"
                  >
                    {copied === line ? COPIED_MESSAGE : 'コピー'}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}

      {/* 状態を色だけで伝えない。読み上げにも届くよう live region にする */}
      <p role="status" aria-live="polite" className="sr-only">
        {copied ? `${copied} を${COPIED_MESSAGE}` : ''}
      </p>

      {failedText ? (
        <div className="mt-4">
          <p role="alert" className="text-meta font-bold text-vermilion">
            {COPY_FAILED_MESSAGE}
          </p>
          <input
            ref={fallbackRef}
            readOnly
            value={failedText}
            aria-label="コピーできなかった行"
            className="mt-1 min-h-tap w-full rounded-control border border-vermilion bg-card px-3 py-2 text-base text-ink"
          />
        </div>
      ) : null}
    </section>
  )
}
