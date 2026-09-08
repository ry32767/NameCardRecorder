import { parseIssueBody } from './serialize'
import type { Card } from './types'
import type { GithubIssue } from '../github/types'

/** GitHub の Issue をアプリ内の 1 件に変換する */
export function cardFromIssue(issue: GithubIssue): Card {
  return {
    ...parseIssueBody(issue.body),
    number: issue.number,
    state: issue.state,
    htmlUrl: issue.html_url,
    createdAt: issue.created_at,
    updatedAt: issue.updated_at,
  }
}
