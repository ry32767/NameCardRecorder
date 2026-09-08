import type { OverlayLine } from '../lib/ocr/overlay'

/**
 * 名刺画像の上に、読み取った文字を**その場所に重ねて**置く。
 * ひとつ押すとその行だけをコピーできる（docs/spec.md 機能2）。
 *
 * 座標は OCR にかけた画像の実寸で返ってくる。保存用と OCR 用は同じ寸法で作っている
 * （`prepareImage`）ので、`viewBox` に実寸を入れておけば表示サイズが変わっても SVG が
 * 勝手に追従する。px を測って計算し直す必要はない。
 */

/**
 * 印字の高さのままだとスマホでは指で押しづらいので、行の上下に余白を足して当たり判定を広げる。
 *
 * 広げる量は**隣の行との隙間の半分まで**。固定値にすると、行が詰まった名刺で隣の行を奪う。
 * それでも印字が小さければ 44px には届かないので、コピーの手段はこれだけにしていない
 * （表の内容はフォームにも自動で入る）。DESIGN.md の不変条件に注記あり。
 */
function hitBoxes(lines: readonly OverlayLine[], height: number) {
  const sorted = [...lines].sort((a, b) => a.bbox.y0 - b.bbox.y0)
  const gaps = new Map<OverlayLine, { top: number; bottom: number }>()

  for (const [index, line] of sorted.entries()) {
    const above = sorted[index - 1]
    const below = sorted[index + 1]
    const lineHeight = line.bbox.y1 - line.bbox.y0
    // 隣が無い側は行の高さぶんまで広げる（上端・下端は画像の外に出さない）
    const top = Math.min(
      above ? Math.max(0, (line.bbox.y0 - above.bbox.y1) / 2) : line.bbox.y0,
      lineHeight,
    )
    const bottom = Math.min(
      below ? Math.max(0, (below.bbox.y0 - line.bbox.y1) / 2) : height - line.bbox.y1,
      lineHeight,
    )
    gaps.set(line, { top: Math.max(0, top), bottom: Math.max(0, bottom) })
  }

  return (line: OverlayLine) => {
    const pad = gaps.get(line) ?? { top: 0, bottom: 0 }
    return {
      x: line.bbox.x0,
      y: line.bbox.y0 - pad.top,
      width: line.bbox.x1 - line.bbox.x0,
      height: line.bbox.y1 - line.bbox.y0 + pad.top + pad.bottom,
    }
  }
}

export function OcrOverlay({
  lines,
  width,
  height,
  onCopy,
}: {
  lines: readonly OverlayLine[]
  /** OCR にかけた画像の実寸（bbox と同じ座標系） */
  width: number
  height: number
  onCopy: (text: string) => void
}) {
  if (lines.length === 0 || width <= 0 || height <= 0) return null
  const hitBox = hitBoxes(lines, height)

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className="absolute inset-0 h-full w-full"
      role="group"
      aria-label="読み取った文字"
    >
      {lines.map((line, index) => {
        const hit = hitBox(line)
        const fontSize = (line.bbox.y1 - line.bbox.y0) * 0.86
        return (
          <g
            key={`${index}-${line.text}`}
            role="button"
            tabIndex={0}
            aria-label={`${line.text} をコピー`}
            className="cursor-pointer"
            onClick={(event) => {
              // 背景の「裏返す」に伝わらないようにする
              event.stopPropagation()
              onCopy(line.text)
            }}
            onKeyDown={(event) => {
              if (event.key !== 'Enter' && event.key !== ' ') return
              event.preventDefault()
              event.stopPropagation()
              onCopy(line.text)
            }}
          >
            {/* 当たり判定。塗りは透明だが pointer-events は拾う */}
            <rect {...hit} fill="transparent" />
            <rect
              x={line.bbox.x0}
              y={line.bbox.y0}
              width={line.bbox.x1 - line.bbox.x0}
              height={line.bbox.y1 - line.bbox.y0}
              rx={fontSize * 0.2}
              className="ocr-box fill-card/85 stroke-indigo/70"
              strokeWidth={Math.max(1, fontSize * 0.05)}
            />
            <text
              x={line.bbox.x0 + (line.bbox.x1 - line.bbox.x0) / 2}
              y={line.bbox.y0 + (line.bbox.y1 - line.bbox.y0) / 2}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={fontSize}
              // 印字と同じ幅に詰める。読み取った文字が原文とズレていても位置が揃う
              textLength={line.bbox.x1 - line.bbox.x0}
              lengthAdjust="spacingAndGlyphs"
              className="fill-ink"
            >
              {line.text}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
