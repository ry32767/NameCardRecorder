import { HttpResponse, http } from 'msw'
import { describe, expect, it } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { server } from '../test/server'
import { TEST_SETTINGS, renderWithProviders } from '../test/render'
import { Settings } from './Settings'
import { REPOSITORY_FORMAT_MESSAGE, loadSettings } from '../lib/settings'

const REPO_URL = 'https://api.github.com/repos/sample-user/namecard-data'

function repoResponse(status: number) {
  return http.get(REPO_URL, () =>
    status === 200
      ? HttpResponse.json({
          full_name: 'sample-user/namecard-data',
          private: true,
          default_branch: 'main',
        })
      : HttpResponse.json({ message: 'error' }, { status }),
  )
}

async function fillForm(repository: string, token: string) {
  const user = userEvent.setup()
  await user.clear(screen.getByLabelText(/データリポジトリ/))
  await user.type(screen.getByLabelText(/データリポジトリ/), repository)
  await user.type(screen.getByLabelText('アクセストークン'), token)
  return user
}

describe('設定画面 / 入力と保存', () => {
  it('owner/repo 形式でない文字列は保存されず、形式のエラーが出る', async () => {
    renderWithProviders(<Settings />)
    const user = await fillForm('not-a-repo', 'ghp_dummy')
    await user.click(screen.getByRole('button', { name: '保存' }))

    expect(await screen.findByText(REPOSITORY_FORMAT_MESSAGE)).toBeInTheDocument()
    expect(loadSettings()).toBeNull()
  })

  it('正しい形式なら保存され、再読み込み後も残る（localStorage）', async () => {
    renderWithProviders(<Settings />)
    const user = await fillForm('sample-user/namecard-data', 'ghp_dummy')
    await user.click(screen.getByRole('button', { name: '保存' }))

    await waitFor(() => {
      expect(loadSettings()).toEqual({
        repository: 'sample-user/namecard-data',
        token: 'ghp_dummy',
      })
    })
  })

  it('トークンが空なら保存しない', async () => {
    renderWithProviders(<Settings />)
    const user = userEvent.setup()
    await user.type(screen.getByLabelText(/データリポジトリ/), 'sample-user/namecard-data')
    await user.click(screen.getByRole('button', { name: '保存' }))

    expect(await screen.findByText('アクセストークンを入力してください')).toBeInTheDocument()
    expect(loadSettings()).toBeNull()
  })
})

describe('設定画面 / 接続テストのエラー分岐', () => {
  it('成功すると 接続できました と出る', async () => {
    server.use(repoResponse(200))
    renderWithProviders(<Settings />)
    const user = await fillForm('sample-user/namecard-data', 'ghp_dummy')
    await user.click(screen.getByRole('button', { name: '接続テスト' }))

    expect(await screen.findByText('接続できました')).toBeInTheDocument()
  })

  it('401 のとき トークンが無効です と出る', async () => {
    server.use(repoResponse(401))
    renderWithProviders(<Settings />)
    const user = await fillForm('sample-user/namecard-data', 'ghp_bad')
    await user.click(screen.getByRole('button', { name: '接続テスト' }))

    expect(await screen.findByText('トークンが無効です')).toBeInTheDocument()
  })

  it('404 のとき 401 とは別の文言が出る', async () => {
    server.use(repoResponse(404))
    renderWithProviders(<Settings />)
    const user = await fillForm('sample-user/namecard-data', 'ghp_dummy')
    await user.click(screen.getByRole('button', { name: '接続テスト' }))

    expect(
      await screen.findByText('リポジトリが見つかりません。名前とトークンの権限を確認してください'),
    ).toBeInTheDocument()
    expect(screen.queryByText('トークンが無効です')).not.toBeInTheDocument()
  })

  it('形式が不正なら接続テストは通信せずエラーになる', async () => {
    // ハンドラを登録していないので、通信すればテストが落ちる（setup.ts の onUnhandledRequest: 'error'）
    renderWithProviders(<Settings />)
    const user = await fillForm('bad repo name', 'ghp_dummy')
    await user.click(screen.getByRole('button', { name: '接続テスト' }))

    expect(await screen.findByText(REPOSITORY_FORMAT_MESSAGE)).toBeInTheDocument()
  })
})

describe('設定画面 / トークンの扱い', () => {
  it('保存済みトークンはマスク表示され、平文で表示されない', () => {
    renderWithProviders(<Settings />, { settings: TEST_SETTINGS })

    expect(screen.getByText(/^ghp_\*+$/)).toBeInTheDocument()
    expect(screen.queryByText(TEST_SETTINGS.token)).not.toBeInTheDocument()
  })

  it('保存済みトークンの値が DOM の属性に一切現れない', () => {
    const { container } = renderWithProviders(<Settings />, { settings: TEST_SETTINGS })

    for (const element of container.querySelectorAll('*')) {
      for (const attribute of element.attributes) {
        expect(attribute.value).not.toContain(TEST_SETTINGS.token)
      }
    }
    expect(container.innerHTML).not.toContain(TEST_SETTINGS.token)
  })

  it('トークン入力欄は password で、入力値が読み取られない形で保持される', async () => {
    renderWithProviders(<Settings />)
    expect(screen.getByLabelText('アクセストークン')).toHaveAttribute('type', 'password')
  })
})

describe('設定画面 / 設定を消去', () => {
  it('確認してから消すと、設定が消えて入力欄に戻る', async () => {
    renderWithProviders(<Settings />, { settings: TEST_SETTINGS })
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: '設定を消去' }))
    await user.click(screen.getByRole('button', { name: '消去する' }))

    await waitFor(() => expect(loadSettings()).toBeNull())
    expect(screen.getByLabelText('アクセストークン')).toBeInTheDocument()
    expect(screen.getByLabelText(/データリポジトリ/)).toHaveValue('')
  })

  it('やめる を押すと消えない', async () => {
    renderWithProviders(<Settings />, { settings: TEST_SETTINGS })
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: '設定を消去' }))
    await user.click(screen.getByRole('button', { name: 'やめる' }))

    expect(loadSettings()).toEqual(TEST_SETTINGS)
  })
})
