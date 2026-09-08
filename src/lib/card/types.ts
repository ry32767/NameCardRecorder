/** 名刺 1 枚分のフィールド。docs/architecture.md の Issue スキーマ v1 に対応する */
export interface CardFields {
  name: string
  nameKana: string
  company: string
  department: string
  title: string
  email: string
  phone: string
  mobile: string
  fax: string
  postalCode: string
  address: string
  website: string
  /** YYYY-MM-DD。既定は登録日 */
  metOn: string
  metAt: string
  /** リポジトリ内の相対パス。例: cards/images/2026/20260908-013a.jpg */
  image: string
  tags: string[]
  memo: string
  /** OCR の生テキスト。本文の details に畳んで残す */
  ocrText: string
}

/** YAML ブロックに書き出す単一値フィールド（順序もこの通りに保つ） */
export const YAML_FIELDS = [
  'name',
  'nameKana',
  'company',
  'department',
  'title',
  'email',
  'phone',
  'mobile',
  'fax',
  'postalCode',
  'address',
  'website',
  'metOn',
  'metAt',
  'image',
] as const

export type YamlField = (typeof YAML_FIELDS)[number]

export function emptyCardFields(): CardFields {
  return {
    name: '',
    nameKana: '',
    company: '',
    department: '',
    title: '',
    email: '',
    phone: '',
    mobile: '',
    fax: '',
    postalCode: '',
    address: '',
    website: '',
    metOn: '',
    metAt: '',
    image: '',
    tags: [],
    memo: '',
    ocrText: '',
  }
}

/** 一覧・詳細で扱う 1 件。Issue 由来のメタ情報を足したもの */
export interface Card extends CardFields {
  number: number
  state: 'open' | 'closed'
  htmlUrl: string
  updatedAt: string
  createdAt: string
}
