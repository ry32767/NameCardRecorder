import { buildCardLabels } from '../card/labels'
import { cardFromIssue } from '../card/card'
import { buildIssueTitle, serializeIssueBody } from '../card/serialize'
import { createIssue } from './issues'
import { ensureLabels } from './labels'
import { putFile } from './contents'
import { fetchRepo } from './repo'
import type { Card, CardFields } from '../card/types'
import type { RepoRef } from './types'

export const IMAGE_UPLOAD_FAILED_MESSAGE = '画像の保存に失敗しました。もう一度お試しください'

/** 画像のコミットに失敗したことを、Issue 作成の失敗と区別して伝える */
export class ImageUploadError extends Error {
  constructor() {
    super(IMAGE_UPLOAD_FAILED_MESSAGE)
    this.name = 'ImageUploadError'
  }
}

/** default_branch はリポジトリごとに変わらないので、保存のたびに問い合わせない */
const branchCache = new Map<string, string>()

export async function resolveDefaultBranch(ref: RepoRef): Promise<string> {
  const key = `${ref.owner}/${ref.repo}`
  const cached = branchCache.get(key)
  if (cached) return cached
  const repo = await fetchRepo(ref)
  const branch = repo.default_branch || 'main'
  branchCache.set(key, branch)
  return branch
}

export function clearBranchCache(): void {
  branchCache.clear()
}

/** cards/images/{YYYY}/{YYYYMMDD}-{ランダム4文字}.jpg */
export function buildImagePath(now: Date = new Date()): string {
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  const suffix = randomSuffix()
  return `cards/images/${year}/${year}${month}${day}-${suffix}.jpg`
}

function randomSuffix(): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789'
  const bytes = new Uint8Array(4)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('')
}

export interface CreateCardInput {
  fields: CardFields
  /** 名刺画像の base64（データ URL のプレフィックスを含まない）。無い場合は画像なしで登録する */
  imageBase64?: string
}

/**
 * 名刺 1 件を登録する。
 *
 * **画像のコミットを Issue 作成より先に行う。**
 * 画像が失敗したら Issue を作らずに投げ返し、本文だけ残って画像リンクが 404 になる
 * 状態を作らない（docs/architecture.md / docs/spec.md の受け入れ条件）。
 */
export async function createCard(ref: RepoRef, input: CreateCardInput): Promise<Card> {
  const branch = await resolveDefaultBranch(ref)

  // ラベルの値は画像に依存しないので、**画像より先に**用意する。
  // 逆順にすると、ラベル作成が失敗したときに画像だけコミットされた状態で
  // 止まり、再試行のたびに孤児の画像が増える。
  // Issues API はラベルを自動作成しないので、この手順自体は省けない。
  const labels = buildCardLabels(input.fields)
  await ensureLabels(ref, labels)

  let imagePath = ''
  if (input.imageBase64) {
    imagePath = buildImagePath()
    try {
      // コミットメッセージに氏名や会社名を入れない（個人情報を Git 履歴の見出しに残さない）
      await putFile(ref, imagePath, input.imageBase64, `Add card image ${imagePath}`)
    } catch {
      throw new ImageUploadError()
    }
  }

  const fields: CardFields = { ...input.fields, image: imagePath }

  const issue = await createIssue(ref, {
    title: buildIssueTitle(fields),
    body: serializeIssueBody(fields, { owner: ref.owner, repo: ref.repo, branch }),
    labels,
  })

  return cardFromIssue(issue)
}
