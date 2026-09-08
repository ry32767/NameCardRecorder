# CLAUDE.md

> Claude Code はこのファイルを自動で読み込みます。このプロジェクトの作業規約・コマンド・検証ループは [AGENTS.md](AGENTS.md) に**一元化**しています（全エージェント共通）。CLAUDE.md はそれを取り込む薄いラッパです。

@AGENTS.md

## Claude Code 固有のメモ

- UI を作る・作り直すときは `project-design-system` スキルを使い、色・タイポ・余白をトークンとして `DESIGN.md` に固定してから component を書く。既定の Tailwind 色をそのまま並べない。
- 実装を分担して進めるときは `docs/spec.md` をそのまま `delegation-workflow` スキルの入力に使える（機能ごとの受け入れ条件が worker への brief になる）。
- 名刺画像を含むスクリーンショットや OCR 結果を会話に貼らない。動作確認は架空のサンプル名刺で行う。
