import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { COPIED_MESSAGE, COPY_FAILED_MESSAGE, OcrTextPanel } from './OcrTextPanel'

// 架空の名刺から読み取れた想定の行（AGENTS.md の Do NOT）
const front = ['株式会社サンプル', '営業本部 第一営業部 課長', '山田 太郎', '03-1234-5678']
const back = ['Sample Inc.', 'Taro Yamada']

function renderPanel(sections = [{ label: '表', lines: front }]) {
  return render(<OcrTextPanel sections={sections} />)
}

describe('OcrTextPanel', () => {
  it('読み取った行をそのまま並べる', () => {
    renderPanel()
    for (const line of front) {
      expect(screen.getByRole('button', { name: new RegExp(line) })).toBeInTheDocument()
    }
  })

  it('行をタップするとその行だけがコピーされる', async () => {
    const user = userEvent.setup()
    renderPanel()

    await user.click(screen.getByRole('button', { name: /株式会社サンプル/ }))

    await waitFor(async () => {
      expect(await navigator.clipboard.readText()).toBe('株式会社サンプル')
    })
  })

  it('コピーすると、その行にコピーしましたと出る', async () => {
    const user = userEvent.setup()
    renderPanel()

    await user.click(screen.getByRole('button', { name: /山田 太郎/ }))

    expect(await screen.findByText(COPIED_MESSAGE)).toBeInTheDocument()
    // 押していない行には出ない
    expect(screen.getAllByText(COPIED_MESSAGE)).toHaveLength(1)
  })

  it('表と裏を分けて見せる', () => {
    renderPanel([
      { label: '表', lines: front },
      { label: '裏', lines: back },
    ])
    expect(screen.getByText('表')).toBeInTheDocument()
    expect(screen.getByText('裏')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Sample Inc\./ })).toBeInTheDocument()
  })

  it('行が 1 つも無ければ何も描かない', () => {
    const { container } = renderPanel([{ label: '表', lines: [] }])
    expect(container).toBeEmptyDOMElement()
  })

  it('裏だけ読み取れた場合は裏だけ出す', () => {
    renderPanel([
      { label: '表', lines: [] },
      { label: '裏', lines: back },
    ])
    expect(screen.queryByText('表')).not.toBeInTheDocument()
    expect(screen.getByText('裏')).toBeInTheDocument()
  })

  it('同じ内容の行が 2 つあっても両方出す', () => {
    renderPanel([{ label: '表', lines: ['サンプル', 'サンプル'] }])
    expect(screen.getAllByRole('button', { name: /サンプル/ })).toHaveLength(2)
  })

  // Clipboard API は HTTPS でないと使えない。黙って失敗させず手動コピーへ誘導する
  it('コピーに失敗したら手で選択できる欄を出す', async () => {
    const user = userEvent.setup()
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValueOnce(new Error('denied'))
    renderPanel()

    await user.click(screen.getByRole('button', { name: /株式会社サンプル/ }))

    expect(await screen.findByText(COPY_FAILED_MESSAGE)).toBeInTheDocument()
    expect(screen.getByLabelText('コピーできなかった行')).toHaveValue('株式会社サンプル')
  })
})
