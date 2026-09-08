# NameCardRecorder

> もらった名刺をスマホで撮るだけで、GitHub の Issues に台帳として貯まっていく名刺管理アプリ。

**公開先: https://ry32767.github.io/NameCardRecorder/**

名刺の山を管理するのに、専用サービスに個人情報を預けたくない。かといって Excel に手入力するのは続かない。
NameCardRecorder は、名刺を撮影 → 文字認識 → 内容を確認して保存、という流れを 30 秒で終わらせ、その結果を**自分の private リポジトリの Issue** として残す。検索も履歴もラベルも GitHub がそのまま使える。

## 主な機能

- **撮影して登録** — カメラまたは画像ファイルから名刺を**表・裏の 2 枚まで**読み込み、ブラウザ内の OCR で文字を検出。読めた行をタップしてコピーし、フォームに貼って登録する。
- **一覧・検索・絞り込み** — 登録済みの名刺をカード形式で一覧表示。氏名・会社・メモの全文検索と、会社／イベント／タグのラベル絞り込み。
- **GitHub がそのまま台帳** — 1 枚の名刺 = 1 Issue。アプリを開かなくても GitHub の画面から閲覧・検索・編集でき、変更履歴も残る。
- **PC / スマホ両対応** — 同じ URL をどちらから開いても使えるレスポンシブ設計。

> 各機能の受け入れ条件は [docs/spec.md](docs/spec.md)。

## 技術スタック

- **フロントエンド**: React 18 + TypeScript + Vite + Tailwind CSS
- **OCR**: Tesseract.js（`jpn` + `eng`、ブラウザ内で完結・無料）
- **データ**: GitHub REST API（別リポジトリの Issues と `cards/images/`）
- **認証**: GitHub Fine-grained Personal Access Token（ブラウザの localStorage に保存）
- **デプロイ**: GitHub Pages（GitHub Actions で自動ビルド）

## リポジトリは 2 つ使う

| リポジトリ | 公開設定 | 中身 |
|---|---|---|
| `NameCardRecorder` | **public** | このアプリのソース。GitHub Pages で公開する |
| `namecard-data`（名前は任意） | **private** | 名刺データ。Issues が台帳、`cards/images/` が名刺画像 |

無料プランの GitHub Pages は public リポジトリからしか公開できないため、**名刺の個人情報は必ず別の private リポジトリに置く**。アプリ側にデータは一切含まれない。詳しくは [docs/architecture.md](docs/architecture.md)。

## フォルダ構成

```
NameCardRecorder/
├── README.md              # このファイル
├── AGENTS.md              # AI エージェント共通の作業規約・検証ループ
├── CLAUDE.md              # Claude Code 固有の補足（AGENTS.md を読み込む）
├── DESIGN.md              # デザイン判断の唯一の正（色・書体・不変条件）
├── docs/                  # ドキュメント
│   ├── README.md          # docs の索引
│   ├── spec.md            # 仕様・受け入れ条件・検証状況・タスク
│   └── architecture.md    # 構成・設計判断・Issue スキーマ・OCR パイプライン
├── src/
│   ├── main.tsx           # エントリ（HashRouter + 設定の Provider）
│   ├── App.tsx            # ルーティングと「未設定なら設定画面へ」の誘導
│   ├── index.css          # Tailwind の読み込みと base スタイル
│   ├── pages/             # 画面（CardList / NewCard / CardDetail / Settings）
│   ├── components/        # UI 部品（Button / TextField / CardTile / …）
│   ├── lib/
│   │   ├── github/        # GitHub API クライアント（Issues / Contents / Labels）
│   │   ├── ocr/           # 画像前処理・Tesseract 実行
│   │   ├── card/          # Issue 本文の serialize / parse・検証・ラベル
│   │   ├── search.ts      # 検索と絞り込み
│   │   ├── settings.ts    # 設定の保存とトークンのマスク
│   │   └── edgeColor.ts   # 会社名から決まるカードの色帯
│   ├── store/             # IndexedDB キャッシュ・同期・設定の Provider
│   └── test/              # テストのセットアップ（MSW・共通 render）
├── .github/workflows/     # Pages へのデプロイ（検証ループも回す）
├── tailwind.config.js     # デザイントークンの固定先
└── index.html
```

テストは対象と同じ場所に `*.test.ts(x)` で置いている（例: `src/lib/card/serialize.test.ts`）。


## セットアップ

### 1. データ用リポジトリを作る

GitHub で **private** リポジトリを 1 つ作る（例: `namecard-data`）。中身は空でよい。

### 2. アクセストークンを発行する

GitHub の Settings → Developer settings → Personal access tokens → **Fine-grained tokens** で、
上で作ったデータ用リポジトリ**だけ**を対象に、以下の権限を付けたトークンを発行する。

| 権限 | レベル | 用途 |
|---|---|---|
| Issues | Read and write | 名刺の登録・閲覧 |
| Contents | Read and write | 名刺画像のコミット |
| Metadata | Read-only | （自動で付く） |

### 3. アプリを動かす

```bash
npm install
npm run dev     # http://localhost:5173/NameCardRecorder/
```

または GitHub Pages に公開した URL を開く。初回に設定画面が出るので、データ用リポジトリ（`owner/repo`）と発行したトークンを入力し、「接続テスト」で疎通を確かめてから保存する。

> 開発サーバの URL に `/NameCardRecorder/` が付くのは、GitHub Pages のサブパス配信に合わせて Vite の `base` を固定しているため。

そのほかのコマンド：

```bash
npm test -- --run   # テスト（ウォッチは npm test）
npm run lint        # ESLint
npm run typecheck   # 型チェック
npm run build       # 本番ビルド
npm run preview     # ビルド結果の確認
```

### 4. GitHub Pages に公開する

このリポジトリの Settings → Pages で **Source を「GitHub Actions」**にする（設定済み）。
`main` に push すると `.github/workflows/deploy.yml` が Lint・型・テスト・ビルドを回してから公開する。

## 使い方

1. **登録** — 「+ 名刺を追加」→ カメラで撮影、または画像を選択（表・裏の 2 枚まで）。数秒で文字認識が走り、読めた行が一覧で出る。行をタップするとコピーできるので、フォームの該当欄に貼る。必要なら「どこで会ったか」やタグを足して保存。
2. **探す** — トップの検索窓に名前や会社名を入れると絞り込まれる。会社・イベント・タグのラベルからも辿れる。
3. **GitHub から見る** — データ用リポジトリの Issues を開けば、アプリなしでも同じ内容を閲覧・編集できる。

## 開発者・AI エージェント向け

- 作業規約・検証ループ・ドキュメント同期は [AGENTS.md](AGENTS.md)（全エージェント共通）
- Claude Code 固有の補足は [CLAUDE.md](CLAUDE.md)
- 仕様・受け入れ条件は [docs/spec.md](docs/spec.md)、設計は [docs/README.md](docs/README.md)

## ライセンス

MIT
