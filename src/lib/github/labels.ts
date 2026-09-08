import { githubRequest } from './client'
import { GithubError } from './errors'
import type { RepoRef } from './types'

/**
 * ラベルが無ければ作る。Issues API はラベルを自動作成しないため
 * （docs/architecture.md）、Issue 作成の前に呼ぶ。
 * 既に存在する場合 GitHub は 422 を返すので、それは成功として扱う。
 */
export async function ensureLabel(ref: RepoRef, name: string): Promise<void> {
  try {
    await githubRequest(ref, `/repos/${ref.owner}/${ref.repo}/labels`, {
      method: 'POST',
      body: { name },
    })
  } catch (error) {
    if (error instanceof GithubError && (error.status === 422 || error.status === 409)) {
      return // 既にある
    }
    throw error
  }
}

export async function ensureLabels(ref: RepoRef, names: readonly string[]): Promise<void> {
  // 並列にすると同名ラベルの競合や副次的なレート消費が読みにくくなるので直列に作る
  for (const name of names) {
    await ensureLabel(ref, name)
  }
}
