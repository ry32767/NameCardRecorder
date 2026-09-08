import { HttpResponse, http } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { server } from '../test/server'
import { TEST_SETTINGS, renderWithProviders } from '../test/render'
import { NewCard } from './NewCard'
import { todayIso } from '../lib/card/validate'
import { clearBranchCache } from '../lib/github/createCard'

// jsdom には canvas も createImageBitmap も無いので、画像の前処理だけ差し替える。
// ファイル種別の判定（画像以外を弾く）は本物をそのまま使い、受け入れ条件を骨抜きにしない。
vi.mock('../lib/ocr/image', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/ocr/image')>()
  return {
    ...actual,
    prepareImage: async (file: File) => {
      if (!actual.isImageFile(file)) throw new actual.ImageLoadError(actual.NOT_AN_IMAGE_MESSAGE)
      return {
        storageBlob: new Blob(['x']),
        storageBase64: 'ZmFrZQ==',
        previewUrl: 'blob:namecard-test',
        ocrBlob: new Blob(['x']),
        width: 1600,
        height: 967,
      }
    },
  }
})

const API = 'https://api.github.com/repos/sample-user/namecard-data'

function renderPage(onCreated = vi.fn()) {
  clearBranchCache()
  const result = renderWithProviders(<NewCard onCreated={onCreated} />, {
    settings: TEST_SETTINGS,
  })
  return { ...result, onCreated }
}

function githubHandlers(onIssue?: () => void) {
  return [
    http.get(API, () =>
      HttpResponse.json({
        full_name: 'sample-user/namecard-data',
        private: true,
        default_branch: 'main',
      }),
    ),
    http.post(`${API}/labels`, () => HttpResponse.json({ name: 'card' }, { status: 201 })),
    http.post(`${API}/issues`, async ({ request }) => {
      onIssue?.()
      const body = (await request.json()) as { title: string; body: string; labels: string[] }
      return HttpResponse.json({
        number: 7,
        title: body.title,
        body: body.body,
        state: 'open',
        labels: body.labels.map((name) => ({ name })),
        created_at: '2026-09-08T00:00:00Z',
        updated_at: '2026-09-08T00:00:00Z',
        html_url: `${API}/issues/7`,
      })
    }),
  ]
}

describe('登録画面 / 確認フォーム', () => {
  it('仕様どおりの入力欄がすべて出ている', () => {
    renderPage()
    for (const label of [
      '氏名',
      'ふりがな',
      '会社名',
      '部署',
      '役職',
      'メール',
      '電話',
      '携帯',
      'FAX',
      '郵便番号',
      '住所',
      'Web サイト',
      '出会った日',
      '出会った場所',
      'メモ',
      'タグ',
    ]) {
      expect(screen.getByLabelText(label)).toBeInTheDocument()
    }
  })

  it('出会った日の初期値が今日になっている', () => {
    renderPage()
    expect(screen.getByLabelText('出会った日')).toHaveValue(todayIso())
  })

  it('すべての欄を手で編集できる', async () => {
    renderPage()
    const user = userEvent.setup()
    await user.type(screen.getByLabelText('氏名'), '鈴木 一郎')
    expect(screen.getByLabelText('氏名')).toHaveValue('鈴木 一郎')
  })
})

describe('登録画面 / バリデーション', () => {
  it('全欄が空のまま保存しようとすると氏名か会社名を促す', async () => {
    renderPage()
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'この内容で登録' }))

    // 通信ハンドラを登録していないので、保存に進めばテストが落ちる
    expect(
      await screen.findAllByText('氏名か会社名のどちらかは入力してください'),
    ).not.toHaveLength(0)
  })

  it('氏名だけでも会社名だけでも保存できる', async () => {
    let created = false
    server.use(...githubHandlers(() => (created = true)))
    renderPage()
    const user = userEvent.setup()

    await user.type(screen.getByLabelText('会社名'), '株式会社サンプル')
    await user.click(screen.getByRole('button', { name: 'この内容で登録' }))

    await waitFor(() => expect(created).toBe(true))
  })

  it('メール欄が形式不正なら保存できない', async () => {
    renderPage()
    const user = userEvent.setup()

    await user.type(screen.getByLabelText('氏名'), '鈴木 一郎')
    await user.type(screen.getByLabelText('メール'), 'not-an-email')
    await user.click(screen.getByRole('button', { name: 'この内容で登録' }))

    expect(await screen.findByText('メールアドレスの形式が正しくありません')).toBeInTheDocument()
  })

  it('エラーを直すとメッセージが消える', async () => {
    renderPage()
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: 'この内容で登録' }))
    await screen.findAllByText('氏名か会社名のどちらかは入力してください')

    await user.type(screen.getByLabelText('氏名'), '鈴木')
    await waitFor(() => {
      expect(screen.queryByText('氏名か会社名のどちらかは入力してください')).not.toBeInTheDocument()
    })
  })
})

describe('登録画面 / 保存', () => {
  it('Issue のタイトルが 氏名 - 会社名 になり、card ラベルが付く', async () => {
    let sent: { title: string; labels: string[] } | null = null
    server.use(
      http.get(API, () =>
        HttpResponse.json({
          full_name: 'sample-user/namecard-data',
          private: true,
          default_branch: 'main',
        }),
      ),
      http.post(`${API}/labels`, () => HttpResponse.json({ name: 'card' }, { status: 201 })),
      http.post(`${API}/issues`, async ({ request }) => {
        const body = (await request.json()) as { title: string; body: string; labels: string[] }
        sent = { title: body.title, labels: body.labels }
        return HttpResponse.json({
          number: 7,
          title: body.title,
          body: body.body,
          state: 'open',
          labels: body.labels.map((name) => ({ name })),
          created_at: '2026-09-08T00:00:00Z',
          updated_at: '2026-09-08T00:00:00Z',
          html_url: `${API}/issues/7`,
        })
      }),
    )

    renderPage()
    const user = userEvent.setup()
    await user.type(screen.getByLabelText('氏名'), '鈴木 一郎')
    await user.type(screen.getByLabelText('会社名'), '株式会社サンプル')
    await user.click(screen.getByRole('button', { name: 'この内容で登録' }))

    await waitFor(() => expect(sent).not.toBeNull())
    expect(sent!.title).toBe('鈴木 一郎 - 株式会社サンプル')
    expect(sent!.labels).toContain('card')
    expect(sent!.labels).toContain('company:株式会社サンプル')
  })

  it('保存に成功すると登録したカードを親に渡す', async () => {
    server.use(...githubHandlers())
    const { onCreated } = renderPage()
    const user = userEvent.setup()

    await user.type(screen.getByLabelText('氏名'), '鈴木 一郎')
    await user.click(screen.getByRole('button', { name: 'この内容で登録' }))

    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1))
    expect(onCreated.mock.calls[0]![0]).toMatchObject({ number: 7, name: '鈴木 一郎' })
  })

  it('保存中はボタンが無効になり二重送信できない', async () => {
    let issueCalls = 0
    server.use(
      http.get(API, () =>
        HttpResponse.json({
          full_name: 'sample-user/namecard-data',
          private: true,
          default_branch: 'main',
        }),
      ),
      http.post(`${API}/labels`, () => HttpResponse.json({ name: 'card' }, { status: 201 })),
      http.post(`${API}/issues`, async () => {
        issueCalls += 1
        await new Promise((resolve) => setTimeout(resolve, 60))
        return HttpResponse.json({
          number: 7,
          title: 't',
          body: '',
          state: 'open',
          labels: [],
          created_at: '2026-09-08T00:00:00Z',
          updated_at: '2026-09-08T00:00:00Z',
          html_url: `${API}/issues/7`,
        })
      }),
    )

    renderPage()
    const user = userEvent.setup()
    await user.type(screen.getByLabelText('氏名'), '鈴木 一郎')

    const button = screen.getByRole('button', { name: 'この内容で登録' })
    await user.click(button)

    await waitFor(() => expect(screen.getByRole('button', { name: /登録しています/ })).toBeDisabled())
    expect(issueCalls).toBe(1)
  })

  it('登録に失敗したらエラーを見せ、フォームに留まる', async () => {
    server.use(
      http.get(API, () =>
        HttpResponse.json({
          full_name: 'sample-user/namecard-data',
          private: true,
          default_branch: 'main',
        }),
      ),
      http.post(`${API}/labels`, () => HttpResponse.json({ name: 'card' }, { status: 201 })),
      http.post(`${API}/issues`, () => HttpResponse.json({}, { status: 401 })),
    )

    renderPage()
    const user = userEvent.setup()
    await user.type(screen.getByLabelText('氏名'), '鈴木 一郎')
    await user.click(screen.getByRole('button', { name: 'この内容で登録' }))

    expect(await screen.findByText('トークンが無効です')).toBeInTheDocument()
    expect(screen.getByLabelText('氏名')).toHaveValue('鈴木 一郎')
  })
})

describe('登録画面 / 画像の取り込み', () => {
  it('画像以外のファイルを選ぶと OCR は始まらず案内が出る', async () => {
    renderPage()

    const file = new File(['dummy'], 'note.txt', { type: 'text/plain' })
    // userEvent.upload は accept 属性で弾いてしまうため、
    // ドラッグ&ドロップ等で画像以外が渡ってきた場合を change で直接再現する
    fireEvent.change(screen.getByLabelText('表の画像ファイルを選択'), { target: { files: [file] } })

    expect(await screen.findByText('画像ファイルを選んでください')).toBeInTheDocument()
    expect(screen.queryByText(/読み取っています/)).not.toBeInTheDocument()
  })

  it('表と裏それぞれにカメラ撮影と画像選択の入口がある', () => {
    renderPage()
    for (const label of [
      '表をカメラで撮影',
      '表の画像ファイルを選択',
      '裏をカメラで撮影',
      '裏の画像ファイルを選択',
    ]) {
      expect(screen.getByLabelText(label)).toBeInTheDocument()
    }
    // 表・裏で 1 組ずつ = 2 組
    expect(screen.getAllByRole('button', { name: 'カメラで撮影' })).toHaveLength(2)
    expect(screen.getAllByRole('button', { name: '画像を選ぶ' })).toHaveLength(2)
  })

  it('裏面は任意であることが分かる', () => {
    renderPage()
    expect(screen.getByText('（任意）')).toBeInTheDocument()
  })

  it('裏の読み取り結果がどこへ行くのかを説明している', () => {
    renderPage()
    expect(screen.getByText(/裏の文字はフォームには入れず/)).toBeInTheDocument()
  })
})

describe('登録画面 / OCR 実行中', () => {
  // 実際の Tesseract は動かさず、OcrProvider を差し替えて「読み取り中」の状態を作る
  function stubProvider() {
    let resolve!: (value: { text: string; lines: { text: string }[] }) => void
    const pending = new Promise<{ text: string; lines: { text: string }[] }>((r) => {
      resolve = r
    })
    let report: ((p: { progress: number; status: string }) => void) | undefined
    return {
      provider: {
        recognize: (_image: Blob, onProgress?: (p: { progress: number; status: string }) => void) => {
          report = onProgress
          return pending
        },
        terminate: () => Promise.resolve(),
      },
      finish: resolve,
      progress: (value: number) => report?.({ progress: value, status: 'recognizing text' }),
    }
  }

  async function startOcr() {
    const stub = stubProvider()
    clearBranchCache()
    renderWithProviders(<NewCard onCreated={vi.fn()} ocrProvider={stub.provider} />, {
      settings: TEST_SETTINGS,
    })
    const file = new File(['fake'], 'card.jpg', { type: 'image/jpeg' })
    fireEvent.change(screen.getByLabelText('表の画像ファイルを選択'), { target: { files: [file] } })
    return stub
  }

  it('OCR 中は保存ボタンが押せない', async () => {
    const stub = await startOcr()

    const button = await screen.findByRole('button', { name: '読み取り中…' })
    expect(button).toBeDisabled()

    stub.finish({ text: '株式会社サンプル', lines: [{ text: '株式会社サンプル' }] })
    await waitFor(() => expect(screen.getByRole('button', { name: 'この内容で登録' })).toBeEnabled())
  })

  it('OCR の進捗が % で表示される', async () => {
    const stub = await startOcr()
    await screen.findByRole('progressbar', { name: '表の OCR の進捗' })

    stub.progress(0.42)
    await waitFor(() => {
      expect(screen.getByRole('progressbar', { name: '表の OCR の進捗' })).toHaveAttribute(
        'aria-valuenow',
        '42',
      )
    })
    expect(screen.getByText('42%')).toBeInTheDocument()

    stub.finish({ text: '', lines: [] })
  })

  it('表を読み取るとフォームに候補が入る', async () => {
    const stub = await startOcr()
    await screen.findByRole('button', { name: '読み取り中…' })

    stub.finish({
      text: ['株式会社サンプル', '山田 太郎', 'taro.yamada@example.co.jp'].join('\n'),
      lines: [
        { text: '株式会社サンプル' },
        { text: '山田 太郎' },
        { text: 'taro.yamada@example.co.jp' },
      ],
    })

    await waitFor(() => expect(screen.getByLabelText('会社名')).toHaveValue('株式会社サンプル'))
    expect(screen.getByLabelText('氏名')).toHaveValue('山田 太郎')
    expect(screen.getByLabelText('メール')).toHaveValue('taro.yamada@example.co.jp')
  })

  it('自動入力された候補は手で直せる', async () => {
    const user = userEvent.setup()
    const stub = await startOcr()
    await screen.findByRole('button', { name: '読み取り中…' })

    stub.finish({ text: '株式会社サンプル', lines: [{ text: '株式会社サンプル' }] })
    const company = await screen.findByDisplayValue('株式会社サンプル')

    await user.clear(company)
    await user.type(company, '合同会社テスト')
    expect(company).toHaveValue('合同会社テスト')
  })

  // 裏は連絡先の続きや英語表記のことが多く、ここから埋めると表の正しい値を上書きしかねない
  it('裏を読み取ってもフォームには入れない', async () => {
    const stub = stubProvider()
    clearBranchCache()
    renderWithProviders(<NewCard onCreated={vi.fn()} ocrProvider={stub.provider} />, {
      settings: TEST_SETTINGS,
    })
    fireEvent.change(screen.getByLabelText('裏の画像ファイルを選択'), {
      target: { files: [new File(['fake'], 'back.jpg', { type: 'image/jpeg' })] },
    })
    await screen.findByRole('button', { name: '読み取り中…' })

    stub.finish({ text: '株式会社サンプル', lines: [{ text: '株式会社サンプル' }] })

    await waitFor(() => expect(screen.getByRole('button', { name: 'この内容で登録' })).toBeEnabled())
    expect(screen.getByLabelText('会社名')).toHaveValue('')
  })
})

describe('登録画面 / 表裏 2 枚の登録', () => {
  function imageFile(name: string) {
    return new File(['fake'], name, { type: 'image/jpeg' })
  }

  it('表と裏の両方を選ぶと 2 枚とも送信される', async () => {
    const sent: string[] = []
    server.use(
      http.get(API, () =>
        HttpResponse.json({
          full_name: 'sample-user/namecard-data',
          private: true,
          default_branch: 'main',
        }),
      ),
      http.post(`${API}/labels`, () => HttpResponse.json({ name: 'card' }, { status: 201 })),
      http.put(`${API}/contents/cards/images/:year/:file`, ({ params }) => {
        sent.push(String(params['file']))
        return HttpResponse.json({ content: { path: 'x', sha: 'abc' } }, { status: 201 })
      }),
      http.post(`${API}/issues`, async ({ request }) => {
        const body = (await request.json()) as { title: string; body: string; labels: string[] }
        return HttpResponse.json({
          number: 7,
          title: body.title,
          body: body.body,
          state: 'open',
          labels: [],
          created_at: '2026-09-08T00:00:00Z',
          updated_at: '2026-09-08T00:00:00Z',
          html_url: `${API}/issues/7`,
        })
      }),
    )

    const stubProvider = {
      recognize: () => Promise.resolve({ text: '', lines: [] }),
      terminate: () => Promise.resolve(),
    }
    clearBranchCache()
    renderWithProviders(<NewCard onCreated={vi.fn()} ocrProvider={stubProvider} />, {
      settings: TEST_SETTINGS,
    })

    const user = userEvent.setup()
    fireEvent.change(screen.getByLabelText('表の画像ファイルを選択'), {
      target: { files: [imageFile('front.jpg')] },
    })
    await waitFor(() => expect(screen.getByAltText(/表/)).toBeInTheDocument())

    fireEvent.change(screen.getByLabelText('裏の画像ファイルを選択'), {
      target: { files: [imageFile('back.jpg')] },
    })
    await waitFor(() => expect(screen.getByAltText(/裏/)).toBeInTheDocument())

    await user.type(screen.getByLabelText('氏名'), '鈴木 一郎')
    await user.click(screen.getByRole('button', { name: 'この内容で登録' }))

    await waitFor(() => expect(sent).toHaveLength(2))
    expect(sent.some((f) => f.includes('-back'))).toBe(true)
  })

  it('選んだ画像を外せる', async () => {
    const user = userEvent.setup()
    clearBranchCache()
    renderWithProviders(
      <NewCard
        onCreated={vi.fn()}
        ocrProvider={{
          recognize: () => Promise.resolve({ text: '', lines: [] }),
          terminate: () => Promise.resolve(),
        }}
      />,
      { settings: TEST_SETTINGS },
    )

    fireEvent.change(screen.getByLabelText('表の画像ファイルを選択'), {
      target: { files: [imageFile('front.jpg')] },
    })
    await waitFor(() => expect(screen.getByAltText(/表/)).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: '表を外す' }))
    expect(screen.queryByAltText(/表/)).not.toBeInTheDocument()
  })
})
