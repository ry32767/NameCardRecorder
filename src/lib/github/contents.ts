import { encodeRepoPath, githubRequest } from './client'
import { GithubError, classifyResponse } from './errors'
import type { GithubContentResponse, RepoRef } from './types'

/**
 * ファイルをリポジトリにコミットする（Contents API）。
 * 名刺画像はここを通す。content は base64（データ URL のプレフィックスを含まない生の base64）。
 */
export async function putFile(
  ref: RepoRef,
  path: string,
  base64Content: string,
  message: string,
): Promise<GithubContentResponse> {
  const { data } = await githubRequest<GithubContentResponse>(
    ref,
    `/repos/${ref.owner}/${ref.repo}/contents/${encodeRepoPath(path)}`,
    { method: 'PUT', body: { message, content: base64Content } },
  )
  return data
}

/**
 * リポジトリ内のファイルを取得して Blob にする。
 *
 * データリポジトリは private なので、`?raw=true` の URL を <img src> にそのまま
 * 入れても認証が無く読めない。トークン付きで取得して object URL にして渡す。
 */
export async function fetchFileBlob(ref: RepoRef, path: string): Promise<Blob> {
  const url = `https://api.github.com/repos/${ref.owner}/${ref.repo}/contents/${encodeRepoPath(path)}`

  let response: Response
  try {
    response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${ref.token}`,
        // raw を指定すると JSON でなくファイルの中身がそのまま返る
        Accept: 'application/vnd.github.raw',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    })
  } catch {
    throw new GithubError('network')
  }

  if (!response.ok) throw new GithubError(classifyResponse(response), response.status)
  return await response.blob()
}
