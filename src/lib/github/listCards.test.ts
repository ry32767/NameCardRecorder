import { HttpResponse, http } from 'msw'
import { describe, expect, it } from 'vitest'
import { server } from '../../test/server'
import { excludePullRequests, listCardIssues } from './issues'
import { GithubError } from './errors'
import { parseNextLink } from './client'
import type { GithubIssue, RepoRef } from './types'

const ref: RepoRef = { owner: 'sample-user', repo: 'namecard-data', token: 'test-token' }
const ISSUES_URL = 'https://api.github.com/repos/sample-user/namecard-data/issues'

function issue(number: number, extra: Partial<GithubIssue> = {}): GithubIssue {
  return {
    number,
    title: `サンプル ${number}`,
    body: '```yaml\nname: サンプル 太郎\n```',
    state: 'open',
    labels: [{ name: 'card' }],
    created_at: '2026-09-01T00:00:00Z',
    updated_at: '2026-09-01T00:00:00Z',
    html_url: `https://github.com/sample-user/namecard-data/issues/${number}`,
    ...extra,
  }
}

describe('excludePullRequests', () => {
  it('pull_request キーを持つものを除外する', () => {
    const result = excludePullRequests([
      issue(1),
      issue(2, { pull_request: { url: 'https://api.github.com/…' } }),
      issue(3),
    ])
    expect(result.map((i) => i.number)).toEqual([1, 3])
  })
})

describe('listCardIssues', () => {
  it('Pull Request が一覧に現れない', async () => {
    server.use(
      http.get(ISSUES_URL, () =>
        HttpResponse.json([issue(1), issue(2, { pull_request: {} }), issue(3)]),
      ),
    )
    const issues = await listCardIssues(ref)
    expect(issues.map((i) => i.number)).toEqual([1, 3])
  })

  it('card ラベルと state=all を指定して取得する', async () => {
    let requestUrl = ''
    server.use(
      http.get(ISSUES_URL, ({ request }) => {
        requestUrl = request.url
        return HttpResponse.json([issue(1)])
      }),
    )
    await listCardIssues(ref)
    expect(requestUrl).toContain('labels=card')
    expect(requestUrl).toContain('state=all')
    expect(requestUrl).toContain('per_page=100')
  })

  it('since を渡すと差分取得のクエリになる', async () => {
    let requestUrl = ''
    server.use(
      http.get(ISSUES_URL, ({ request }) => {
        requestUrl = request.url
        return HttpResponse.json([])
      }),
    )
    await listCardIssues(ref, { since: '2026-09-01T00:00:00.000Z' })
    expect(requestUrl).toContain('since=2026-09-01T00%3A00%3A00.000Z')
  })

  it('ページネーションを辿って全件集める', async () => {
    server.use(
      http.get(ISSUES_URL, ({ request }) => {
        const page = new URL(request.url).searchParams.get('page')
        if (page === '2') return HttpResponse.json([issue(3)])
        return HttpResponse.json([issue(1), issue(2)], {
          headers: { link: `<${ISSUES_URL}?page=2>; rel="next", <${ISSUES_URL}?page=2>; rel="last"` },
        })
      }),
    )
    const issues = await listCardIssues(ref)
    expect(issues.map((i) => i.number)).toEqual([1, 2, 3])
  })

  it('401 は unauthorized として分類される', async () => {
    server.use(http.get(ISSUES_URL, () => HttpResponse.json({}, { status: 401 })))
    await expect(listCardIssues(ref)).rejects.toMatchObject({ kind: 'unauthorized' })
  })

  it('403 かつ残数 0 はレート制限として分類される', async () => {
    server.use(
      http.get(ISSUES_URL, () =>
        HttpResponse.json({}, { status: 403, headers: { 'x-ratelimit-remaining': '0' } }),
      ),
    )
    await expect(listCardIssues(ref)).rejects.toMatchObject({ kind: 'rateLimited' })
  })

  it('403 で残数があれば権限不足として分類される', async () => {
    server.use(
      http.get(ISSUES_URL, () =>
        HttpResponse.json({}, { status: 403, headers: { 'x-ratelimit-remaining': '4999' } }),
      ),
    )
    await expect(listCardIssues(ref)).rejects.toMatchObject({ kind: 'forbidden' })
  })

  it('通信できないときは network として分類される', async () => {
    server.use(http.get(ISSUES_URL, () => HttpResponse.error()))
    const error = await listCardIssues(ref).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(GithubError)
    expect((error as GithubError).kind).toBe('network')
  })

  it('エラーの message にトークンが含まれない', async () => {
    server.use(http.get(ISSUES_URL, () => HttpResponse.json({}, { status: 401 })))
    const error = await listCardIssues(ref).catch((e: unknown) => e)
    expect((error as Error).message).not.toContain('test-token')
    expect((error as Error).message).toBe('トークンが無効です')
  })
})

describe('parseNextLink', () => {
  it('rel="next" の URL だけ取り出す', () => {
    expect(parseNextLink('<https://a/?page=2>; rel="next", <https://a/?page=9>; rel="last"')).toBe(
      'https://a/?page=2',
    )
  })

  it('next が無ければ undefined', () => {
    expect(parseNextLink('<https://a/?page=9>; rel="last"')).toBeUndefined()
    expect(parseNextLink(null)).toBeUndefined()
  })
})
