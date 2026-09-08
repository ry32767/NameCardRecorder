/**
 * 会社名から小口帯の色を決める（DESIGN.md のシグネチャ）。
 * 自由な HSL を生成せず、トークンに定義した 6 色から決定論的に選ぶ。
 * 同じ会社は常に同じ色になり、名刺入れの中で同じ会社の紙が同じ色に見える状態を作る。
 */
const EDGE_CLASSES = [
  'bg-edge-indigo',
  'bg-edge-moss',
  'bg-edge-sand',
  'bg-edge-murasaki',
  'bg-edge-tetsu',
  'bg-edge-vermilion',
] as const

/**
 * 戻り値の型をトークン由来のクラス名に閉じておく。
 * DESIGN.md 不変条件 1（色をベタ書きしない）を、規約と ESLint だけでなく型でも守るため。
 */
export type EdgeColorClass = (typeof EDGE_CLASSES)[number] | 'bg-rule'

/** 会社名が無い名刺は色を持たせず、罫線と同じ色にする */
const FALLBACK: EdgeColorClass = 'bg-rule'

export function edgeColorClass(company: string): EdgeColorClass {
  const key = company.trim()
  if (!key) return FALLBACK

  // 会社名を安定したハッシュに落とす（FNV-1a）。並び順や登録順に依存させない
  let hash = 0x811c9dc5
  for (let i = 0; i < key.length; i += 1) {
    hash ^= key.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return EDGE_CLASSES[hash % EDGE_CLASSES.length] ?? FALLBACK
}
