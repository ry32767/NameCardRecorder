import { githubRequest } from './client'
import type { GithubResponse } from './client'
import type { GithubIssue, RepoRef } from './types'

export const CARD_LABEL = 'card'

/** Issues API に混ざる Pull Request を除外する（docs/architecture.md） */
export function excludePullRequests(issues: readonly GithubIssue[]): GithubIssue[] {
  return issues.filter((issue) => issue.pull_request === undefined)
}

export interface ListIssuesOptions {
  /** ISO8601。差分同期のとき前回の同期時刻を渡す */
  since?: string
  signal?: AbortSignal
}

/**
 * `card` ラベルの付いた Issue を全件（ページネーションを辿って）取得する。
 * since を渡すと updated_at がそれ以降のものだけになる。
 */
export async function listCardIssues(
  ref: RepoRef,
  options: ListIssuesOptions = {},
): Promise<GithubIssue[]> {
  const params = new URLSearchParams({
    labels: CARD_LABEL,
    state: 'all',
    per_page: '100',
    sort: 'updated',
    direction: 'desc',
  })
  if (options.since) params.set('since', options.since)

  let url: string | undefined = `/repos/${ref.owner}/${ref.repo}/issues?${params.toString()}`
  const collected: GithubIssue[] = []

  while (url) {
    const response: GithubResponse<GithubIssue[]> = await githubRequest<GithubIssue[]>(ref, url, {
      ...(options.signal ? { signal: options.signal } : {}),
    })
    collected.push(...excludePullRequests(response.data))
    url = response.nextUrl
  }

  return collected
}

export interface CreateIssueInput {
  title: string
  body: string
  labels: string[]
}

export async function createIssue(ref: RepoRef, input: CreateIssueInput): Promise<GithubIssue> {
  const { data } = await githubRequest<GithubIssue>(ref, `/repos/${ref.owner}/${ref.repo}/issues`, {
    method: 'POST',
    body: input,
  })
  return data
}
