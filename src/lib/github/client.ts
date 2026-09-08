import { GithubError, classifyResponse } from './errors'
import type { RepoRef } from './types'

const API_ROOT = 'https://api.github.com'

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT'
  body?: unknown
  /** ページネーションで Link ヘッダを読みたい呼び出し用 */
  signal?: AbortSignal
}

export interface GithubResponse<T> {
  data: T
  /** 次ページの URL。Link ヘッダに rel="next" が無ければ undefined */
  nextUrl: string | undefined
  rateLimitRemaining: number | undefined
}

/**
 * GitHub API への唯一の入口。
 * コンポーネントから直接 fetch しない規約（AGENTS.md）の受け皿でもある。
 * path は絶対 URL でもよい（ページネーションの next をそのまま渡せる）。
 */
export async function githubRequest<T>(
  ref: RepoRef,
  path: string,
  options: RequestOptions = {},
): Promise<GithubResponse<T>> {
  const url = path.startsWith('http') ? path : `${API_ROOT}${path}`

  let response: Response
  try {
    response = await fetch(url, {
      method: options.method ?? 'GET',
      headers: {
        // トークンはヘッダにのみ載せる。クエリ文字列に入れない（漏洩経路になる）
        Authorization: `Bearer ${ref.token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
      ...(options.signal ? { signal: options.signal } : {}),
    })
  } catch {
    // 例外オブジェクトはそのまま投げない。URL やリクエスト内容が混ざる可能性があるため。
    throw new GithubError('network')
  }

  if (!response.ok) {
    throw new GithubError(classifyResponse(response), response.status)
  }

  const remainingHeader = response.headers.get('x-ratelimit-remaining')
  const remaining = remainingHeader === null ? undefined : Number(remainingHeader)

  const data = (response.status === 204 ? null : await response.json()) as T

  return {
    data,
    nextUrl: parseNextLink(response.headers.get('link')),
    rateLimitRemaining: Number.isNaN(remaining) ? undefined : remaining,
  }
}

/** `<https://...&page=2>; rel="next", <...>; rel="last"` から next だけ取り出す */
export function parseNextLink(link: string | null): string | undefined {
  if (!link) return undefined
  for (const part of link.split(',')) {
    const match = part.match(/<([^>]+)>\s*;\s*rel="next"/)
    if (match?.[1]) return match[1]
  }
  return undefined
}

export function encodeRepoPath(path: string): string {
  // ディレクトリ区切りは残したまま、各セグメントだけをエスケープする
  return path.split('/').map(encodeURIComponent).join('/')
}
