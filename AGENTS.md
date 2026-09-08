# AGENTS.md

> このプロジェクトでコードを書く**すべての AI エージェント（Codex / Cursor / Claude Code など）共通の作業規約**。作業前に読むこと。Claude Code は `CLAUDE.md` 経由で読み込む。

## ドキュメントの役割

- **README.md**（直下・人間向け）：概要・セットアップ・使い方。AI 専用手順は書かない。
- **AGENTS.md**（このファイル）：作業規約・コマンド・検証ループ・ドキュメント同期規約。
- **CLAUDE.md**（直下）：Claude Code 固有の補足のみ。
- **docs/**：`spec.md`（機能・受け入れ条件＝合格ライン）、`architecture.md`（構成・設計判断・Issue スキーマ・OCR パイプライン）、`README.md`（索引）。

作業前に：実装する機能と受け入れ条件は `docs/spec.md`、データの持ち方と外部連携は `docs/architecture.md` を読む。

## Tech Stack

| レイヤー | 技術 |
|---|---|
| フロント | React 18 + TypeScript + Vite + Tailwind CSS |
| ルーティング | React Router (HashRouter — GitHub Pages のため) |
| OCR | PaddleOCR（PP-OCRv5 日本語モデル / ONNX Runtime Web、`@paddleocr/paddleocr-js`）を既定に、Tesseract.js (`jpn`+`eng`) を選択肢として併存。どちらも Web Worker で実行し、**画像は端末から出さない** |
| データ | GitHub REST API（別 private リポジトリの Issues + Contents） |
| ローカルキャッシュ | IndexedDB（`idb`） |
| 認証 | Fine-grained PAT を localStorage に保存 |
| テスト | Vitest + @testing-library/react + MSW（GitHub API モック） |
| デプロイ | GitHub Pages（`.github/workflows/deploy.yml`） |

**バックエンドは無い。** サーバーサイドのコードを足す提案をする前に `docs/spec.md` の「スコープ外」を確認すること。

## Commands

```bash
npm install          # 依存
npm run dev          # 開発サーバ (http://localhost:5173)
npm test             # Vitest（ウォッチなし: npm test -- --run）
npm run lint         # ESLint
npm run typecheck    # tsc --noEmit
npm run build        # 本番ビルド（tsc + vite build）
npm run preview      # ビルド結果の確認
```

> `package.json` にこれらの script が無い状態でセットアップを終わらせない。検証ループが回らなくなる。

## Verification Loop（検証ループ）

**機能を実装したら、完了宣言の前に必ず回す。** 最重要の規約。

1. 実装する
2. 検証する：`npm test -- --run` → `npm run lint` → `npm run typecheck` → `npm run build`
3. `docs/spec.md` の該当機能の**受け入れ条件**を 1 つずつ照合する
4. 1 つでも失敗・未達なら原因を直して 2 に戻る
5. すべて green かつ全受け入れ条件 ○ で初めて「完了」

ルール：

- テスト / Lint / 型 / ビルドにエラーがある状態で「完了」と言わない。
- 手動確認が必要な受け入れ条件（カメラ、実機での見え方、実際の名刺での OCR）は、**何をどう確認したかを一言報告する**。確認していないなら「未確認」と正直に書く。
- テストの無い受け入れ条件は、可能なら先にテストを書く。特に **OCR の項目抽出 (`src/lib/ocr/parser`)、OCR の戻り値の変換 (`src/lib/ocr/paddleResult`)、Issue 本文の serialize/parse (`src/lib/card/`) は必ずユニットテストを持たせる**（ここが壊れるとデータが静かに壊れる）。
  **OCR エンジンの SDK を import するファイル (`paddle.ts` / `tesseract.ts`) はテストから読まない。** ONNX Runtime と OpenCV が jsdom に降ってきて回らなくなるので、テスト対象の純粋な処理は SDK を import しない側（`paddleResult.ts`）に置く。表裏の OCR テキストの読み分けと、旧形式を読む後方互換の経路もテストで押さえること。
- **parser のテストは、整形済みのきれいなテキストだけで書かない。** Tesseract は日本語を `株 式 会 社 サ ンプ ル` のように文字単位で空けて返す。実際の出力の形でも通ることを必ず 1 ケース以上入れる（これを見落として抽出が全滅していたことがある）。
- 仕様の不備で満たせないときは `docs/spec.md` の「未決定事項」に追記して相談する。

## ドキュメント同期規約

コードだけ進んで docs が古くなると土台が嘘になる。だから：

- **仕様や挙動を変えたら、対応するドキュメントを同じ変更（コミット）で更新する。**
  - 機能・受け入れ条件・タスク → `docs/spec.md`
  - Issue 本文のスキーマ、ラベル体系、画像パス、API の使い方、キャッシュ戦略、設計判断 → `docs/architecture.md`
  - セットアップ手順・使い方・フォルダ構成 → `README.md`
- **docs を増減したら `docs/README.md` の索引も直す。** 図（Mermaid）を持つ docs は実装とズレたら図も直す。
- 今すぐ直せないズレは `docs/spec.md` の「未決定事項」に残して放置しない。

**特に重要：Issue 本文のスキーマ (`docs/architecture.md`) を変えるときは、既存データとの後方互換を必ず検討する。** フィールドの削除・リネームは、旧形式も読める parser を残すか、移行手順を `docs/architecture.md` に書くこと。

## コーディング規約

- TypeScript の `any` 禁止。外部 API のレスポンスは型を定義して受ける。
- コメントは日本語。「何をしているか」ではなく「なぜそうしたか」を書く。
- 1 ファイル 200 行を目安に分割する。
- GitHub API 呼び出しは `src/lib/github/` に閉じ込め、コンポーネントから直接 `fetch` しない。
- 個人情報（氏名・連絡先・画像）を `console.log` に出さない。エラーログにも含めない。
- UI はモバイルファーストで書く（Tailwind のブレークポイントは `sm:` 以上で拡張）。タップ領域は最低 44px。

## Do NOT

- **名刺データ・画像・トークンをこのリポジトリにコミットしない。** ここは public リポジトリになる。テスト用のサンプル名刺は架空の人物・会社で作る。
- トークンを URL クエリ、`console.log`、エラーレポート、外部サービスに送らない。
- 依存を勝手に追加しない（追加するなら理由を `docs/architecture.md` の設計判断表に書く）。
- `README.md` に AI 向け手順を書かない（人間向けに保つ）。
- 仕様を変えたのに docs を直さず「完了」と言わない。
