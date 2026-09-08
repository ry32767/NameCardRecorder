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

/**
 * cards/images/{YYYY}/{YYYYMMDD}-{ランダム4文字}.jpg（表）
 * 裏は同じ基底に `-back` を付ける。表裏が隣り合って並び、対応が目で見て分かるようにするため。
 */
export function buildImagePath(now: Date = new Date(), side: 'front' | 'back' = 'front'): string {
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  const suffix = randomSuffix()
  return `cards/images/${year}/${year}${month}${day}-${suffix}${side === 'back' ? '-back' : ''}.jpg`
}

/** 表裏で同じ基底名を共有させる */
export function buildImagePathPair(now: Date = new Date()): { front: string; back: string } {
  const front = buildImagePath(now)
  return { front, back: front.replace(/\.jpg$/, '-back.jpg') }
}

function randomSuffix(): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789'
  const bytes = new Uint8Array(4)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('')
}

export interface CreateCardInput {
  fields: CardFields
  /** 表面画像の base64（データ URL のプレフィックスを含まない）。無い場合は画像なしで登録する */
  imageBase64?: string
  /** 裏面画像の base64。任意 */
  imageBackBase64?: string
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

  const paths = buildImagePathPair()
  let imagePath = ''
  let imageBackPath = ''

  // 表・裏とも Issue 作成より先にコミットする。
  // どちらか 1 枚でも失敗したら Issue を作らない（本文だけ残って画像リンクが 404 になる状態を作らない）。
  // 先に上がった 1 枚は孤児として残るが、再試行では別のパスを採るので上書きも取り違えも起きない。
  try {
    if (input.imageBase64) {
      // コミットメッセージに氏名や会社名を入れない（個人情報を Git 履歴の見出しに残さない）
      await putFile(ref, paths.front, input.imageBase64, `Add card image ${paths.front}`)
      imagePath = paths.front
    }
    if (input.imageBackBase64) {
      await putFile(ref, paths.back, input.imageBackBase64, `Add card image ${paths.back}`)
      imageBackPath = paths.back
    }
  } catch {
    throw new ImageUploadError()
  }

  const fields: CardFields = { ...input.fields, image: imagePath, imageBack: imageBackPath }

  const issue = await createIssue(ref, {
    title: buildIssueTitle(fields),
    body: serializeIssueBody(fields, { owner: ref.owner, repo: ref.repo, branch }),
    labels,
  })

  return cardFromIssue(issue)
}
