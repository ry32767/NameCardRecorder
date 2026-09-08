// GitHub REST API のレスポンスのうち、このアプリが実際に読むフィールドだけを型にする。
// AGENTS.md の「外部 API のレスポンスは型を定義して受ける」に従い any を使わない。

export interface GithubLabel {
  name: string
}

export interface GithubIssue {
  number: number
  title: string
  body: string | null
  state: 'open' | 'closed'
  labels: GithubLabel[]
  created_at: string
  updated_at: string
  html_url: string
  /** Issues API には Pull Request も混ざる。このキーがあれば PR なので除外する */
  pull_request?: unknown
}

export interface GithubRepo {
  full_name: string
  private: boolean
  default_branch: string
}

export interface GithubContentResponse {
  content: {
    path: string
    sha: string
  } | null
}

/** データリポジトリの指定と認証情報 */
export interface RepoRef {
  owner: string
  repo: string
  token: string
}
