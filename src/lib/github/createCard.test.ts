import { HttpResponse, http } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { server } from '../../test/server'
import { emptyCardFields } from '../card/types'
import {
  IMAGE_UPLOAD_FAILED_MESSAGE,
  ImageUploadError,
  buildImagePath,
  clearBranchCache,
  createCard,
} from './createCard'
import type { RepoRef } from './types'

const ref: RepoRef = { owner: 'sample-user', repo: 'namecard-data', token: 'test-token' }
const API = 'https://api.github.com'

// 架空の名刺（AGENTS.md: 実在の名刺をリポジトリに入れない）
const fields = {
  ...emptyCardFields(),
  name: '山田 太郎',
  company: '株式会社サンプル',
  metOn: '2026-09-08',
  tags: ['要フォロー'],
}

function repoHandler() {
  return http.get(`${API}/repos/sample-user/namecard-data`, () =>
    HttpResponse.json({ full_name: 'sample-user/namecard-data', private: true, default_branch: 'main' }),
  )
}

function labelHandler() {
  return http.post(`${API}/repos/sample-user/namecard-data/labels`, () =>
    HttpResponse.json({ name: 'card' }, { status: 201 }),
  )
}

function issueHandler(onCall: () => void) {
  return http.post(`${API}/repos/sample-user/namecard-data/issues`, async ({ request }) => {
    onCall()
    const body = (await request.json()) as { title: string; body: string; labels: string[] }
    return HttpResponse.json({
      number: 12,
      title: body.title,
      body: body.body,
      state: 'open',
      labels: body.labels.map((name) => ({ name })),
      created_at: '2026-09-08T00:00:00Z',
      updated_at: '2026-09-08T00:00:00Z',
      html_url: 'https://github.com/sample-user/namecard-data/issues/12',
    })
  })
}

beforeEach(() => {
  clearBranchCache()
})

describe('createCard', () => {
  it('画像をコミットしてから Issue を作る', async () => {
    const order: string[] = []
    server.use(
      repoHandler(),
      http.put(`${API}/repos/sample-user/namecard-data/contents/:a/:b/:c/:d`, () => {
        order.push('image')
        return HttpResponse.json({ content: { path: 'x', sha: 'abc' } }, { status: 201 })
      }),
      labelHandler(),
      issueHandler(() => order.push('issue')),
    )

    const card = await createCard(ref, { fields, imageBase64: 'ZmFrZQ==' })

    expect(order).toEqual(['image', 'issue'])
    expect(card.number).toBe(12)
    expect(card.name).toBe('山田 太郎')
    expect(card.image).toMatch(/^cards\/images\/\d{4}\/\d{8}-[a-z0-9]{4}\.jpg$/)
  })

  it('画像のコミットに失敗したら Issue を作らない', async () => {
    let issueCreated = false
    server.use(
      repoHandler(),
      http.put(`${API}/repos/sample-user/namecard-data/contents/:a/:b/:c/:d`, () =>
        HttpResponse.json({ message: 'boom' }, { status: 500 }),
      ),
      labelHandler(),
      issueHandler(() => {
        issueCreated = true
      }),
    )

    await expect(createCard(ref, { fields, imageBase64: 'ZmFrZQ==' })).rejects.toBeInstanceOf(
      ImageUploadError,
    )
    expect(issueCreated).toBe(false)
  })

  it('画像の失敗はユーザー向けの文言を持つ', async () => {
    server.use(
      repoHandler(),
      labelHandler(),
      http.put(`${API}/repos/sample-user/namecard-data/contents/:a/:b/:c/:d`, () =>
        HttpResponse.json({ message: 'boom' }, { status: 403 }),
      ),
    )
    await expect(createCard(ref, { fields, imageBase64: 'ZmFrZQ==' })).rejects.toThrow(
      IMAGE_UPLOAD_FAILED_MESSAGE,
    )
  })

  it('card / company: / tag: ラベルを付ける', async () => {
    const requested: string[] = []
    server.use(
      repoHandler(),
      http.put(`${API}/repos/sample-user/namecard-data/contents/:a/:b/:c/:d`, () =>
        HttpResponse.json({ content: { path: 'x', sha: 'abc' } }, { status: 201 }),
      ),
      http.post(`${API}/repos/sample-user/namecard-data/labels`, async ({ request }) => {
        const body = (await request.json()) as { name: string }
        requested.push(body.name)
        return HttpResponse.json({ name: body.name }, { status: 201 })
      }),
      issueHandler(() => {}),
    )

    const card = await createCard(ref, {
      fields: { ...fields, metAt: '展示会2026' },
      imageBase64: 'ZmFrZQ==',
    })

    expect(requested).toContain('card')
    expect(requested).toContain('company:株式会社サンプル')
    expect(requested).toContain('tag:要フォロー')
    expect(requested).toContain('event:展示会2026')
    expect(card.tags).toEqual(['要フォロー'])
  })

  it('既にあるラベル（422）は成功として扱う', async () => {
    server.use(
      repoHandler(),
      http.put(`${API}/repos/sample-user/namecard-data/contents/:a/:b/:c/:d`, () =>
        HttpResponse.json({ content: { path: 'x', sha: 'abc' } }, { status: 201 }),
      ),
      http.post(`${API}/repos/sample-user/namecard-data/labels`, () =>
        HttpResponse.json({ message: 'already_exists' }, { status: 422 }),
      ),
      issueHandler(() => {}),
    )

    await expect(createCard(ref, { fields, imageBase64: 'ZmFrZQ==' })).resolves.toMatchObject({
      number: 12,
    })
  })

  it('画像が無い場合は Contents API を呼ばずに登録する', async () => {
    let imageCalled = false
    server.use(
      repoHandler(),
      http.put(`${API}/repos/sample-user/namecard-data/contents/*`, () => {
        imageCalled = true
        return HttpResponse.json({}, { status: 201 })
      }),
      labelHandler(),
      issueHandler(() => {}),
    )

    const card = await createCard(ref, { fields })
    expect(imageCalled).toBe(false)
    expect(card.image).toBe('')
  })
})

describe('buildImagePath', () => {
  it('cards/images/{YYYY}/{YYYYMMDD}-xxxx.jpg の形になる', () => {
    const path = buildImagePath(new Date(2026, 8, 8))
    expect(path).toMatch(/^cards\/images\/2026\/20260908-[a-z0-9]{4}\.jpg$/)
  })

  it('呼ぶたびに別のファイル名になる', () => {
    const a = buildImagePath(new Date(2026, 8, 8))
    const b = buildImagePath(new Date(2026, 8, 8))
    expect(a).not.toBe(b)
  })
})

describe('createCard / 失敗時に中途半端な状態を残さない', () => {
  it('ラベルの作成に失敗したら画像もコミットしない', async () => {
    let imageCommitted = false
    server.use(
      repoHandler(),
      http.post(`${API}/repos/sample-user/namecard-data/labels`, () =>
        HttpResponse.json({ message: 'forbidden' }, { status: 403, headers: { 'x-ratelimit-remaining': '10' } }),
      ),
      http.put(`${API}/repos/sample-user/namecard-data/contents/:a/:b/:c/:d`, () => {
        imageCommitted = true
        return HttpResponse.json({ content: { path: 'x', sha: 'abc' } }, { status: 201 })
      }),
      issueHandler(() => {}),
    )

    await expect(createCard(ref, { fields, imageBase64: 'ZmFrZQ==' })).rejects.toThrow()
    // 画像を先にコミットしていると、再試行のたびに孤児の画像が増える
    expect(imageCommitted).toBe(false)
  })
})

describe('createCard / 表裏 2 枚の画像', () => {
  function contentsHandler(onPut: (path: string) => void) {
    return http.put(
      `${API}/repos/sample-user/namecard-data/contents/cards/images/:year/:file`,
      ({ params }) => {
        onPut(String(params['file']))
        return HttpResponse.json({ content: { path: 'x', sha: 'abc' } }, { status: 201 })
      },
    )
  }

  it('表だけでも登録できる', async () => {
    const put: string[] = []
    server.use(repoHandler(), labelHandler(), contentsHandler((f) => put.push(f)), issueHandler(() => {}))

    const card = await createCard(ref, { fields, imageBase64: 'ZmFrZQ==' })

    expect(put).toHaveLength(1)
    expect(card.image).toMatch(/\d{8}-[a-z0-9]{4}\.jpg$/)
    expect(card.imageBack).toBe('')
  })

  it('表と裏の 2 枚をコミットし、裏は -back のパスになる', async () => {
    const put: string[] = []
    server.use(repoHandler(), labelHandler(), contentsHandler((f) => put.push(f)), issueHandler(() => {}))

    const card = await createCard(ref, {
      fields,
      imageBase64: 'ZmFrZQ==',
      imageBackBase64: 'YmFjaw==',
    })

    expect(put).toHaveLength(2)
    expect(card.image).toMatch(/\d{8}-[a-z0-9]{4}\.jpg$/)
    expect(card.imageBack).toBe(card.image.replace('.jpg', '-back.jpg'))
  })

  it('裏だけの登録もできる', async () => {
    const put: string[] = []
    server.use(repoHandler(), labelHandler(), contentsHandler((f) => put.push(f)), issueHandler(() => {}))

    const card = await createCard(ref, { fields, imageBackBase64: 'YmFjaw==' })

    expect(put).toHaveLength(1)
    expect(card.image).toBe('')
    expect(card.imageBack).toMatch(/-back\.jpg$/)
  })

  it('裏のコミットに失敗したら Issue を作らない', async () => {
    let issueCreated = false
    server.use(
      repoHandler(),
      labelHandler(),
      http.put(
        `${API}/repos/sample-user/namecard-data/contents/cards/images/:year/:file`,
        ({ params }) =>
          String(params['file']).includes('-back')
            ? HttpResponse.json({ message: 'boom' }, { status: 500 })
            : HttpResponse.json({ content: { path: 'x', sha: 'abc' } }, { status: 201 }),
      ),
      issueHandler(() => {
        issueCreated = true
      }),
    )

    await expect(
      createCard(ref, { fields, imageBase64: 'ZmFrZQ==', imageBackBase64: 'YmFjaw==' }),
    ).rejects.toBeInstanceOf(ImageUploadError)
    expect(issueCreated).toBe(false)
  })
})
