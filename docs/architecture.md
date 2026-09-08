# アーキテクチャ

全体概要は [../README.md](../README.md)、機能と受け入れ条件は [spec.md](spec.md)、作業規約は [../AGENTS.md](../AGENTS.md)。

## 1. 全体構成

サーバーは持たない。ブラウザで動く SPA が、ユーザー自身のトークンで GitHub API を直接叩く。

```mermaid
flowchart LR
    subgraph Browser["ブラウザ (PC / スマホ)"]
        UI["React SPA"]
        OCR["Tesseract.js (Web Worker)"]
        Cache[("IndexedDB キャッシュ")]
    end
    subgraph GH["GitHub"]
        Pages["Pages: NameCardRecorder (public)"]
        Issues["Issues: namecard-data (private)"]
        Files["cards/images/: namecard-data (private)"]
    end
    Pages -->|SPA を配信| UI
    UI --> OCR
    UI --> Cache
    UI -->|Issues API + PAT| Issues
    UI -->|Contents API + PAT| Files
```

| 要素 | 役割 |
|---|---|
| `NameCardRecorder`（public） | アプリのソースと GitHub Pages の配信元。**データは一切含まない** |
| `namecard-data`（private） | 名刺台帳。Issues がレコード、`cards/images/` が名刺画像 |
| PAT | `namecard-data` のみに絞った Fine-grained token。ブラウザの localStorage に保存 |

## 2. 主要な設計判断

| 判断 | 選択 | 理由 | 代替（不採用の理由） |
|---|---|---|---|
| データの置き場 | 別 private リポジトリの Issues | 無料の Pages は public リポジトリ限定。個人情報を public に置けない | 同一リポジトリ（データが公開されてしまう）／GitHub Pro で private Pages（有料） |
| 認証 | Fine-grained PAT を localStorage | サーバー不要で完全無料。個人利用なら十分 | OAuth App（トークン交換に別サーバーが必要）／Device Flow（GitHub のエンドポイントが CORS 非対応） |
| OCR | 既定は Tesseract.js（ブラウザ内）。設定に API キーを入れたときだけ Google Cloud Vision | Tesseract は日本語の精度が実用に届かなかった（下記）。Vision は精度が出るが**画像を外部に送る**ので、使うかどうかを利用者が選べる形にした | Vision だけにする（キー無し・オフラインで OCR が一切使えなくなる）／Tesseract だけ（精度が上がらない） |
| Vision の API キーの置き場 | localStorage に保存し、リクエストのクエリ（`?key=`）に載せる | Vision REST API がクエリでのキー受け渡ししか用意していない。バックエンドが無いので隠し場所も無い | サーバーを立てて中継（`docs/spec.md` のスコープ外）。**緩和策として、Google Cloud 側で HTTP リファラー制限と API の絞り込みを掛けてもらう**（設定画面に明記） |
| 名刺画像の見せ方 | 常に片面だけを出し、押すと裏返す（登録・詳細の両方） | 実物の名刺と同じ扱いで、狭い画面でも 1 枚を大きく見せられる | 表・裏を並べる（スマホでは 1 枚ずつが小さくなり、重ねた文字が押せない） |
| 検索 | 全件を IndexedDB にキャッシュしてクライアント側で検索 | 数百件なら即応。オフラインでも一覧が見える。Search API のインデックス遅延を避けられる | GitHub Search API（新規 Issue が数秒〜数分ヒットしない・レート制限が別枠で厳しい） |
| 画像の保存 | `cards/images/` にコミットして Issue から参照 | 後から実物を見返せる。Git に履歴が残る | Issue への添付（API から不可）／保存しない（照合できない） |
| ルーティング | HashRouter | GitHub Pages は SPA のリライトができず、直リンクで 404 になる | BrowserRouter + 404.html ハック（挙動が読みにくい） |
| YAML の読み書き | 自前の最小実装（`src/lib/card/yaml.ts`） | 依存を増やさない規約に従う。扱うのは「1 階層・文字列だけ」で、必要なのは引用と復号のみ | `yaml` パッケージ（数十 KB の依存を、この用途のためだけに足すことになる） |
| デザイントークン | `tailwind.config.js` の `theme.colors` を**置き換え**、根拠を `DESIGN.md` に固定 | 既定の `gray-*` / `blue-*` を機械的に使えなくして、色のベタ書きを防ぐ | `extend` で足すだけ（既定色が併用でき、一貫性が崩れる） |
| 書体 | webfont を読み込まず system stack（ゴシック／明朝／等幅のロール分け） | 日本語 webfont は数 MB あり、Tesseract の言語データと重なるとスマホの初回起動が壊れる | Google Fonts の日本語書体（初回表示の性能要件に反する） |
| 画像の表示 | Contents API から `Accept: application/vnd.github.raw` で取得し object URL にする | データリポジトリは private なので、`?raw=true` の URL を `<img src>` に入れても認証が無く読めない | 本文の raw URL をそのまま使う（アプリ内では 404 になる） |
| 一覧の並び（既定） | 出会った日 → Issue 番号の降順 | 登録直後の 1 件が必ず先頭に来る（受け入れ条件） | `updated_at` 順（GitHub 側で古い名刺を編集すると先頭に来てしまう） |
| 一覧の並べ替え | 「項目＋向き」を 1 つの `select` にまとめ、絞り込みの**後**に掛ける（`src/lib/sort.ts`） | 操作が 1 手で済む。空欄はどの向きでも末尾、同値は Issue 番号で決着させて順序が揺れないようにする | 項目と昇順・降順を別々の UI にする（2 手になる割に得るものが無い）／列ヘッダのクリック（一覧はカードのグリッドで列が無い） |

### セキュリティ上の前提

- PAT は localStorage に平文で入る。**アプリのリポジトリを public にする以上、XSS を持ち込まないことが唯一の防壁**になる。`dangerouslySetInnerHTML` と、信頼できない文字列を DOM に流す実装を禁止する。
- トークンは `namecard-data` の Issues / Contents だけに絞る。漏れても被害範囲がそのリポジトリで止まる。
- 名刺データは第三者の個人情報。データ用リポジトリを public にしない、ログに残さない。
- **画像の外部送信は Cloud Vision を選んだときだけ**起きる。既定（キー未設定）では画像は端末から出ない。
  キーを入れる画面で「画像が Google に送信される」ことと課金を明示し、いつでもキーを消して既定に戻せるようにする。
- Vision の API キーはトークンと同じ扱い（マスク表示・DOM 属性に出さない・ログに出さない）。ただし
  **リクエストのクエリには載る**ので、キーの制限は Google Cloud 側で掛けてもらう前提にする。

## 3. データの持ち方

### 1 枚の名刺 = 1 Issue

- **タイトル**: `氏名 - 会社名`（例: `山田 太郎 - 株式会社サンプル`）。氏名が空なら `(氏名未入力) - 会社名`。
- **状態**: `open` = 現役、`closed` = アーカイブ（退職・不要）。削除はしない。
- **本文**: 先頭にスキーマ版のマーカー、続けて YAML ブロック。GitHub 上でも読めて、機械でも確実に読める形にする。

~~~markdown
<!-- namecard:v1 -->

```yaml
name: 山田 太郎
nameKana: やまだ たろう
company: 株式会社サンプル
department: 営業本部 第一営業部
title: 課長
email: taro.yamada@example.co.jp
phone: 03-1234-5678
mobile: 090-1234-5678
fax: 03-1234-5679
postalCode: 100-0001
address: 東京都千代田区千代田1-1-1 サンプルビル 8F
website: https://example.co.jp
metOn: 2026-09-08
metAt: 東京ビッグサイト / 展示会2026
image: cards/images/2026/20260908-013a.jpg
```

## メモ

新製品の件で再連絡する。

## 名刺画像

![名刺](https://github.com/{owner}/{repo}/blob/main/cards/images/2026/20260908-013a.jpg?raw=true)

<details><summary>OCR 生テキスト</summary>

株式会社サンプル
営業本部 第一営業部 課長
山田 太郎
...

</details>
~~~

| フィールド | 型 | 必須 | 備考 |
|---|---|---|---|
| `name` | string | – | 氏名。空でも登録できる |
| `nameKana` | string | – | ふりがな |
| `company` | string | – | 会社名 |
| `department` | string | – | 部署 |
| `title` | string | – | 役職 |
| `email` / `website` | string | – | 形式チェックあり |
| `phone` / `mobile` / `fax` | string | – | 印字のまま保持（ハイフン含む） |
| `postalCode` / `address` | string | – | |
| `metOn` | `YYYY-MM-DD` | ✓ | 既定は登録日 |
| `metAt` | string | – | 場所・イベント名。`event:` ラベルの元にもなる |
| `image` | string | – | リポジトリ内の相対パス |
| `tags` | string | – | カンマ区切り（例: `tags: 要フォロー, 技術`）。`tag:` ラベルの元 |

**空の値は書かない**（`name: ""` ではなくキーごと省略）。パーサは欠けたキーを `undefined` として扱う。

#### 値の引用ルール（`src/lib/card/yaml.ts`）

住所・会社名にはコロン・記号・空白が普通に入る。**ここを緩めるとデータが静かに壊れる**ので、
次のいずれかに当てはまる値は必ず二重引用符で囲み、`\` `"` 改行をエスケープする。

- 空文字、前後に空白がある、改行・タブを含む
- `: ` を含む／`:` で終わる（`key: value` と誤読される）
- ` #` を含む（コメント開始と誤読される）
- `- ? : , [ ] { } # & * ! | > ' " % @ \`` のいずれかで始まる
- `true` / `false` / `null` / `yes` / `no` / `on` / `off` / `~`（真偽値・null と誤読される）
- 数値として読める（`2024` など）
- `\` を含む

読み取り側は**最初のコロンだけ**で分割する（`website: https://example.co.jp` を壊さないため）。

#### 後方互換

- 先頭に `<!-- namecard:v1 -->` を書くが、**マーカーが無くても・知らない版でも、YAML ブロックが読めれば読む**。
- 知らないキーは無視する（前方互換）。欠けたキーは空として扱う。
- スキーマを変えるときは、この「旧形式も読めるパーサを残す」方針を維持する。`tags` を後から足したときも、
  `tags` の無い旧 Issue はタグ無しとして読める形にしてある。

### ラベル

| ラベル | 用途 | 例 |
|---|---|---|
| `card` | 名刺 Issue の目印。**全件に必ず付ける** | `card` |
| `company:{会社名}` | 会社での絞り込み | `company:株式会社サンプル` |
| `event:{イベント名}` | もらった場面での絞り込み。**`metAt`（出会った場所）から作る** | `event:展示会2026` |
| `tag:{任意}` | 自由なタグ。`tags` から作る | `tag:要フォロー` |

ラベルは存在しなければ作成してから付ける（Issues API はラベル自動作成をしない）。作成時に GitHub が返す
422 / 409 は「既にある」として成功扱いにする。`card` 以外のラベルは検索の補助であり、正となる値は本文の YAML 側。
**表示・検索は YAML を正とし、ラベルはあくまで GitHub 上で使うための冗長化**とする
（アプリ内の一覧・検索・絞り込みは、ラベルを一切見ずに YAML だけで動く）。

タグにカンマは使えない（`tags` の 1 行表現で区切りと区別できなくなるため、入力時に空白へ置き換える）。

### 画像

- 保存先: `cards/images/{YYYY}/{YYYYMMDD}-{ランダム4文字}.jpg`
- クライアントで長辺 1600px にリサイズし JPEG 品質 0.8 で圧縮（目安 200–400KB）
- Contents API (`PUT /repos/{owner}/{repo}/contents/{path}`) に base64 でコミット
- 手順は **ラベル作成 → 画像コミット → Issue 作成**。
  - 画像は **Issue 作成より先**。画像が失敗したら Issue を作らず、ユーザーに再試行させる（本文だけ残って画像リンクが 404 になる状態を作らない）
  - ラベルは **画像より先**。逆順だと、ラベル作成が失敗したときに画像だけがコミットされ、再試行のたびに孤児の画像が増える
- コミットメッセージに氏名・会社名を入れない（個人情報を Git 履歴の見出しに残さない）
- **アプリ内での表示は Contents API 経由**。private リポジトリなので本文の `?raw=true` URL は
  `<img src>` では読めない。`Accept: application/vnd.github.raw` で取得して object URL にする
  （`src/components/CardImage.tsx`）。本文の raw URL は GitHub の画面で見るためのもの

## 4. GitHub API の使い方

| 操作 | エンドポイント |
|---|---|
| 一覧取得 | `GET /repos/{o}/{r}/issues?labels=card&state=all&per_page=100&sort=updated&direction=desc` |
| 差分取得 | 上に `&since={ISO8601}` を付ける（`updated_at` が基準） |
| 登録 | `POST /repos/{o}/{r}/issues` |
| 更新 | `PATCH /repos/{o}/{r}/issues/{number}` |
| 画像コミット | `PUT /repos/{o}/{r}/contents/{path}` |
| ラベル作成 | `POST /repos/{o}/{r}/labels`（409 は「既にある」として無視） |
| 接続確認 | `GET /repos/{o}/{r}`（設定画面の「接続テスト」） |

- ヘッダ: `Authorization: Bearer {PAT}` / `Accept: application/vnd.github+json` / `X-GitHub-Api-Version: 2022-11-28`
- **Pull Request は Issues API にも混ざる**ので、`pull_request` キーを持つものは除外する。
- レート制限（認証済み 5,000/時）は `x-ratelimit-remaining` を見て、残り少なければ同期を止めてユーザーに知らせる。
- 401 はトークン不正 → 設定画面へ誘導。404 はリポジトリ名違いか権限不足 → その旨を出す（両者を「エラー」で一括りにしない）。

### 同期とキャッシュ

```
起動 → IndexedDB から即座に一覧を描画（オフラインでも見える）
     → since=lastSyncedAt で差分だけ取得
     → 差分を IndexedDB にマージ、lastSyncedAt を更新、画面を更新
```

- 初回は全件をページネーションで取得する。
- 登録・更新の直後は、API のレスポンスをそのままキャッシュに反映する（再取得を待たない）。
- **`lastSyncedAt` はキャッシュへの書き込みが成功したときだけ進める。** 書けていないのに進めると、
  次回は差分しか取りに行かないのにキャッシュは空、という状態になり名刺が消えたように見える。
- キャッシュは「リポジトリ + トークンの持ち主」単位。設定でリポジトリを変えたらキャッシュを捨てる。

## 5. OCR パイプライン

```mermaid
sequenceDiagram
    actor U as ユーザー
    participant A as アプリ
    participant T as Tesseract.js
    participant V as Cloud Vision
    participant G as GitHub API
    U->>A: 名刺を撮影 / 画像を選択 (表・裏 最大2枚・片面ずつ)
    A->>A: EXIF 回転補正・リサイズ (Tesseract 用にグレースケール化)
    alt API キーあり
        A->>V: images:annotate (画像を送信)
        V-->>A: 生テキスト + 行ごとの座標
    else 既定
        A->>T: OCR 実行 (jpn+eng)
        T-->>A: 生テキスト + 行ごとの座標
    end
    A->>A: 行の空白を整える → 項目抽出 (表のみ)
    A-->>U: 画像の上に読み取った行を重ね、確認フォームに候補を表示
    U->>A: 行を押してコピー / 内容を確認・修正
    U->>A: 保存
    A->>G: POST labels (無ければ作成)
    A->>G: PUT contents (表の画像)
    A->>G: PUT contents (裏の画像・任意)
    G-->>A: OK
    A->>G: POST issues (本文 + ラベル)
    G-->>A: Issue 番号
    A-->>U: 一覧に反映
```

### 前処理

`<canvas>` で、EXIF の向きを補正 → 長辺 1600px にリサイズ → グレースケール → コントラスト強調。Tesseract は小さすぎる文字と傾きに弱いので、**前処理をサボると精度が目に見えて落ちる**。

### 項目抽出（`src/lib/ocr/parser`）

Tesseract の出力は行単位のテキスト。次の順で「確実なもの」から潰していき、残りから氏名を推定する。

| 項目 | 判定方法 |
|---|---|
| `email` | `[\w.+-]+@[\w-]+\.[\w.-]+` |
| `website` | `https?://…` または `www.` 始まり |
| `postalCode` | `〒?\s*\d{3}-?\d{4}` |
| `address` | 郵便番号と同じ行の続き、または都道府県名で始まる行 |
| `phone` / `mobile` / `fax` | 電話番号パターン。同じ行の `TEL` `FAX` `携帯` `Mobile` `M.` などのラベルで振り分け。`090/080/070` 始まりは `mobile` |
| `company` | `株式会社` `有限会社` `合同会社` `(株)` `Inc.` `Corp.` `Co., Ltd.` を含む行 |
| `title` | 役職辞書（代表取締役 / 取締役 / 部長 / 次長 / 課長 / 係長 / 主任 / マネージャー / Director / Manager …）に一致する語 |
| `department` | `部` `課` `本部` `室` `Div.` で終わる語で、役職を除いた部分 |
| `nameKana` | ひらがな・カタカナのみで構成される短い行 |
| `name` | 上記すべてを除いた残りのうち、**文字の高さが最大**の行（Tesseract の bbox を使う）。取れなければ最上部に近い短い行 |

**抽出結果はすべて「候補」**。信頼度は問わず、ユーザーが確認フォームで直す前提で作る。抽出できなかった項目は空欄にする（間違った値を入れるより空の方がよい）。

`parser` は純関数（入力: 行テキスト + bbox、出力: フィールド候補）にして、画像なしでユニットテストできるようにする。テストは合成した OCR テキスト（架空の人物・会社）で書く。

実装は `src/lib/ocr/parser.ts`。判定は NFKC 正規化した文字列で行い（全角の `ＴＥＬ ０３－…` を吸収する）、
**値としては元の行をそのまま返す**（`㈱サンプル` を `(株)サンプル` に化けさせないため）。
一度使った文字列は空白で潰し、同じ番号が電話と FAX の両方に入らないようにしている。
電話・FAX・携帯の振り分けは、**行頭〜直前の番号の終わりまで**に現れるラベルだけを見るので、
`TEL 03-1234-5678  FAX 03-1234-5679` のように 1 行に 2 つ並んでいても分けられる。

> 会社名の判定に使う `Co.` は `example.co.jp` にも当たる。いまはメール・URL を先に潰しているので
> 実害は出ていないが、**スキームも `@` も無い裸のドメイン行**が来ると会社名に入りうる。順序に依存した
> 危うさなので、判定を足すときはこの順序を崩さないこと。

> 以下は Tesseract の出力を前提にした話。**Cloud Vision は文字ごとに空白を入れてこない**ので、
> 整形は素通りする（無害）。抽出ルール自体は両方のエンジンで共通に使う。

#### 抽出の前に空白を詰める（`src/lib/ocr/lines.ts`）

Tesseract は日本語で**文字と文字の間に空白を入れてくる**。架空の名刺で実測した例:

```
株式会社サンプル      → 株 式 会 社 サ ンプ ル
営業本部 第一営業部   → 営業 本 部 第 一 営業 部
```

NFKC 正規化は空白を詰めないので、この形のままだと `株 式 会 社` は会社名の判定に当たらず、
`課 長` は役職辞書に当たらない。つまり**実際の OCR 出力では抽出がほぼ全滅していた**。
一方で `山田 太郎` の姓名の区切りや `TEL 03-1234-5678` の空白は消してはいけない。そこで

- 空白区切りのトークンが**すべて CJK**で、かつ**過半数が 1 文字**の行だけ詰める
- それ以外の行は触らない

というルールにし、`parseOcrLines` の入口で適用している（bbox は氏名の推定に使うのでそのまま持ち越す）。
Issue 本文の `ocrText` には**生テキストをそのまま**残す（後から別の解釈をやり直せるようにするため）。

#### 裏面は抽出に使わない

抽出に掛けるのは**表の画像だけ**。裏は連絡先の続きや英語表記のことが多く、
ここから埋めると表から取れた正しい値を上書きしかねない。裏の生テキストは
`ocrTextBack` として Issue 本文に残すだけにする。

#### 一度「振り分けをやめる」に倒して戻した経緯

2026-09-08、いったん自動振り分けを全廃し「読めた行をタップしてコピーする」方式に置き換えたが、
**OCR の精度そのものが低いままではコピー元の文字列も使い物にならず、体験は変わらなかった**ため戻した。
このとき同時に、上の「抽出の前に空白を詰める」を parser 側に入れている。
**精度の問題は振り分けの有無ではなく OCR の出力品質**なので、次に手を入れるなら
`OcrProvider` の差し替え（クラウド OCR / LLM）から検討すること。同じ反転を繰り返さない。

### Cloud Vision（任意・API キーがあるときだけ）

> **リファラー制限はオリジンで書く。** ブラウザが付ける `Referer` は、既定の Referrer-Policy
> （`strict-origin-when-cross-origin`）ではオリジンまで（`https://ry32767.github.io/`）で、
> パスもハッシュも送られない。`https://ry32767.github.io/NameCardRecorder/*` のように
> パスを含めて制限すると一致せず 403（`API_KEY_HTTP_REFERRER_BLOCKED`）になる。

`https://vision.googleapis.com/v1/images:annotate?key=…` に `DOCUMENT_TEXT_DETECTION` で 1 回 POST する。
実装は `src/lib/ocr/vision.ts`。

- 送るのは**保存用のカラー画像**（`storageBlob` を base64 化）。Tesseract 向けのグレースケール強調は
  Vision には不要で、むしろ精度を落とす。`languageHints` に `ja` / `en` を渡す。
- 返ってくるのは ページ → ブロック → 段落 → 単語 → 文字 の階層。段落をそのまま 1 行にすると
  複数行が繋がるので、**文字ごとの `detectedBreak` が改行のところで行を切る**。
  行の bbox は含まれる単語の頂点の外接矩形（頂点は軸平行とは限らず、値が 0 の座標はキーごと省略される）。
- 失敗の本文には Google 自身の理由が入っている（`error.details[].reason`）。
  `SERVICE_DISABLED` / `API_KEY_HTTP_REFERRER_BLOCKED` / `API_KEY_SERVICE_BLOCKED` / `BILLING_DISABLED` …
  を**次に何をすればいいかが分かる日本語**に翻訳して画面に出す（`VISION_REASON_MESSAGES`）。
  知らない理由なら**Google の原文をそのまま添える**。ここを潰すと切り分けができなくなる
  （実際に 403 が出たとき、まとめた文言では原因に辿り着けなかった）。
- 200 でも画像ごとに `responses[0].error` が入ることがあるので、そちらも同じ経路で見せる。
- キーは例外メッセージにも URL ログにも入れない。
- 失敗しても手入力で登録できる状態は保つ（OCR は補助であって必須ではない）。

`OcrProvider` の実装が 2 つになっただけなので、呼び出し側（`src/pages/NewCard.tsx`）は
`src/lib/ocr/engine.ts` でどちらを使うか決めるだけでよい。

### 読み取った文字を画像に重ねる

OCR が返す bbox は**OCR にかけた画像の実寸**。保存用と OCR 用は同じ寸法で作っている（`prepareImage`）ので、
プレビュー画像の上に `viewBox="0 0 幅 高さ"` の SVG を重ねれば、表示サイズが変わっても位置が合う
（px を測って計算し直す必要がない）。実装は `src/components/OcrOverlay.tsx`。

- 1 行が 1 つの `role="button"`。押すとその行だけをクリップボードにコピーする。
- 当たり判定は**隣の行との隙間の半分まで**上下に広げる。固定値だと行が詰まった名刺で隣を奪う。
- それでも印字が小さいと 44px には届かない（実測: 375px 幅で 20〜30px）。
  タップだけに頼らせないため、表の内容はフォームにも自動で入り、キーボードでも各行に到達できる。
- SVG の中では `box-shadow` のフォーカスリングが出ないので、枠線を強めて代わりにしている（`src/index.css`）。

### 言語データの配信（未決定事項の決定）

`jpn`+`eng` の学習データ（10–15MB）は **tesseract.js の既定どおり CDN から取得**し、リポジトリに同梱しない。

- 同梱するとアプリのリポジトリと Pages の成果物が 15MB 太る。ブラウザにキャッシュされるので 2 回目以降は効かない。
- **画像は外に出ない。**送るのではなく、辞書を取ってきてブラウザ内で処理する（プライバシー前提は保たれる）。
- Tesseract 本体は動的 import にして初期表示のバンドルから外してある（`src/pages/NewCard.tsx`）。
- 初回だけ辞書のダウンロード時間が乗る。**`docs/spec.md` の OCR 所要時間（PC 10 秒／スマホ 20 秒）は
  辞書取得後の 2 回目以降を指す**ものとして扱う。

### 差し替え可能にしておく

将来クラウド OCR や LLM に切り替えられるよう、`OcrProvider` インタフェース（`recognize(image): Promise<OcrResult>`）を切り、Tesseract 実装をその 1 つとして置く。呼び出し側はインタフェースにだけ依存する。

実装済み: `src/lib/ocr/types.ts` に `OcrProvider`、`src/lib/ocr/tesseract.ts` に Tesseract 実装。
`NewCard` は props で provider を差し替えられる。

## 6. デプロイ

`.github/workflows/deploy.yml` で `main` への push をトリガーに `npm ci && npm run build` → `actions/deploy-pages`。

- Vite の `base` は `/NameCardRecorder/` に設定する（Pages のサブパス）。**後から変えるとアセットのパスが
  全部ズレる**ので、開発の最初から入れてある。
- ワークフローは公開前に `lint` → `typecheck` → `test --run` → `build` を回す。壊れたものを Pages に出さない。
- 公開されるのはアプリのコードだけ。ビルド成果物にトークンもデータも含まれない（含めないことを保つのが `AGENTS.md` の Do NOT）。

## 7. コードの置き場所

| 役割 | ファイル |
|---|---|
| GitHub API の入口（認証ヘッダ・ページネーション・エラー分類） | `src/lib/github/client.ts` / `errors.ts` |
| Issues の一覧・作成、PR 除外 | `src/lib/github/issues.ts` |
| Contents へのコミットと画像取得 | `src/lib/github/contents.ts` |
| ラベルの用意 | `src/lib/github/labels.ts` |
| 登録の流れ（画像 → ラベル → Issue） | `src/lib/github/createCard.ts` |
| Issue 本文の serialize / parse | `src/lib/card/serialize.ts` / `yaml.ts` |
| ラベルの組み立て | `src/lib/card/labels.ts` |
| 保存前の検証 | `src/lib/card/validate.ts` |
| OCR の項目抽出（辞書・ヒューリスティック） | `src/lib/ocr/parser.ts` / `dictionaries.ts` / `lines.ts` |
| OCR エンジンの選択（Tesseract / Cloud Vision） | `src/lib/ocr/engine.ts` |
| Cloud Vision の呼び出しと行の組み立て | `src/lib/ocr/vision.ts` |
| 読み取った行の画像への重ね表示とコピー | `src/components/OcrOverlay.tsx` / `src/lib/ocr/overlay.ts` / `src/lib/clipboard.ts` |
| 名刺画像の表裏の切り替え表示（詳細画面） | `src/components/CardImages.tsx` |
| 画像の前処理（EXIF・リサイズ・グレースケール） | `src/lib/ocr/image.ts` |
| 検索・絞り込み | `src/lib/search.ts` |
| 一覧の並べ替え | `src/lib/sort.ts` |
| 設定（localStorage・形式検証・マスク） | `src/lib/settings.ts` |
| キャッシュと同期 | `src/store/db.ts` / `useCards.ts` / `merge.ts` |
| 画面 | `src/pages/CardList.tsx` / `NewCard.tsx` / `CardDetail.tsx` / `Settings.tsx` |
| デザイントークンの根拠 | `../DESIGN.md`（値は `../tailwind.config.js`） |
