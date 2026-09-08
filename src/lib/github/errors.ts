/**
 * GitHub API のエラーを、ユーザーに見せる文言と 1 対 1 で対応する種類に分類する。
 * docs/spec.md が 401 と 404 を別メッセージにすることを受け入れ条件にしているため、
 * 「エラー」で一括りにせず種類を保つ。
 */
export type GithubErrorKind =
  | 'unauthorized' // 401: トークンが無効
  | 'notFound' // 404: リポジトリ名違い or 権限不足
  | 'rateLimited' // 403 かつ残数 0
  | 'forbidden' // 403 その他（権限不足）
  | 'network' // 通信到達せず（オフライン含む）
  | 'unknown'

export class GithubError extends Error {
  readonly kind: GithubErrorKind
  readonly status: number | undefined

  constructor(kind: GithubErrorKind, status?: number) {
    // Error の message には URL も本文も入れない。
    // 個人情報やトークンがログ・エラーレポートに混ざるのを構造的に防ぐ（AGENTS.md）。
    super(describeGithubError(kind))
    this.name = 'GithubError'
    this.kind = kind
    this.status = status
  }
}

/** 受け入れ条件で文言が指定されているものは、この関数を唯一の出どころにする */
export function describeGithubError(kind: GithubErrorKind): string {
  switch (kind) {
    case 'unauthorized':
      return 'トークンが無効です'
    case 'notFound':
      return 'リポジトリが見つかりません。名前とトークンの権限を確認してください'
    case 'rateLimited':
      return 'GitHub API の利用回数の上限に達しました。しばらく待ってからお試しください'
    case 'forbidden':
      return 'この操作の権限がありません。トークンの権限を確認してください'
    case 'network':
      return '通信できませんでした。ネットワークの状態を確認してください'
    case 'unknown':
      return 'GitHub との通信に失敗しました。もう一度お試しください'
  }
}

/** HTTP レスポンスから種類を決める。403 はレート制限と権限不足を残数ヘッダで見分ける */
export function classifyResponse(response: Response): GithubErrorKind {
  if (response.status === 401) return 'unauthorized'
  if (response.status === 404) return 'notFound'
  if (response.status === 403 || response.status === 429) {
    const remaining = response.headers.get('x-ratelimit-remaining')
    return remaining === '0' ? 'rateLimited' : 'forbidden'
  }
  return 'unknown'
}
