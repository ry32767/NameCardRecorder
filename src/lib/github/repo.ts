import { githubRequest } from './client'
import type { GithubRepo, RepoRef } from './types'

/** 設定画面の「接続テスト」。成功すればリポジトリ情報を返す */
export async function fetchRepo(ref: RepoRef): Promise<GithubRepo> {
  const { data } = await githubRequest<GithubRepo>(ref, `/repos/${ref.owner}/${ref.repo}`)
  return data
}
