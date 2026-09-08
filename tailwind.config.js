/** @type {import('tailwindcss').Config} */
// DESIGN.md がデザイン判断の唯一の正。ここはその値の固定先。
// theme.colors を「拡張」ではなく「置き換え」にしているのは、
// Tailwind 既定の gray-* / blue-* をうっかり使えなくするため（AIっぽさの主要因）。
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    colors: {
      transparent: 'transparent',
      current: 'currentColor',
      white: '#FFFFFF',
      black: '#000000',

      // 前景（印刷インクの黒は純黒ではなく青みを持つ、という観察から）
      ink: {
        DEFAULT: '#131A22',
        soft: '#55626E',
        faint: '#64707A',
      },
      // 背景（名刺用紙のわずかに緑みを帯びた白）
      paper: '#F1F3EF',
      card: '#FFFFFF',
      rule: {
        DEFAULT: '#D7DCD3', // 装飾的なヘアライン
        strong: '#868F82', // 入力欄の境界など、見えている必要がある線（3:1 以上）
      },
      // 主アクセント＝藍。名刺の刷り色の定番
      indigo: {
        DEFAULT: '#2C4C7C',
        deep: '#1D3357',
        tint: '#E7ECF4',
      },
      // 状態色
      vermilion: { DEFAULT: '#B23B27', tint: '#F7E8E4' }, // 破壊的操作・エラー（朱肉）
      moss: { DEFAULT: '#3F6B4A', tint: '#E6EFE7' }, // 成功
      // 小口帯（会社ごとの色）。自由な HSL ではなく、この 6 色から決定論的に選ぶ
      edge: {
        indigo: '#2C4C7C',
        moss: '#3F6B4A',
        sand: '#8A6A3B',
        murasaki: '#5A4372',
        tetsu: '#3D5C5E',
        vermilion: '#B23B27',
      },
    },
    extend: {
      fontFamily: {
        // 日本語 UI に webfont を足すと初回 DL が数 MB 増え、
        // Tesseract の言語データ（10-15MB）と重なってスマホの初回起動が壊れる。
        // だから書体は system stack に固定し、区別は weight / tracking / ロールで作る。
        sans: [
          'Hiragino Kaku Gothic ProN',
          'Hiragino Sans',
          'Yu Gothic Medium',
          'Yu Gothic',
          'Meiryo',
          'Noto Sans JP',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'sans-serif',
        ],
        // 氏名の表示だけに使う。実物の名刺が明朝で刷られていることに由来する
        mincho: [
          'Hiragino Mincho ProN',
          'Yu Mincho',
          'YuMincho',
          'Noto Serif JP',
          'MS PMincho',
          'serif',
        ],
        // 電話番号・郵便番号・日付・Issue 番号。桁が揃うと台帳として読みやすい
        mono: [
          'ui-monospace',
          'SFMono-Regular',
          'SF Mono',
          'Menlo',
          'Consolas',
          'Liberation Mono',
          'monospace',
        ],
      },
      fontSize: {
        // 入力欄は 16px 未満だと iOS で自動ズームするため、base を 16px から下げない
        meta: ['0.8125rem', { lineHeight: '1.15rem' }],
        base: ['1rem', { lineHeight: '1.6rem' }],
        title: ['1.125rem', { lineHeight: '1.5rem', letterSpacing: '-0.01em' }],
        head: ['1.375rem', { lineHeight: '1.85rem', letterSpacing: '-0.02em' }],
      },
      borderRadius: {
        control: '4px',
        card: '6px',
      },
      aspectRatio: {
        // 日本の標準名刺 91×55mm。一覧のカードはこの比率を持つ
        meishi: '91 / 55',
      },
      boxShadow: {
        // 紙が 1 枚持ち上がった程度。ドロップシャドウを効かせすぎない
        card: '0 1px 2px rgba(19, 26, 34, 0.06), 0 1px 1px rgba(19, 26, 34, 0.04)',
        lift: '0 4px 12px rgba(19, 26, 34, 0.10)',
        sheet: '0 -2px 12px rgba(19, 26, 34, 0.08)',
      },
      transitionDuration: {
        DEFAULT: '150ms',
      },
      minHeight: {
        tap: '44px', // タップ領域の下限
      },
      minWidth: {
        tap: '44px',
      },
    },
  },
  plugins: [],
}
