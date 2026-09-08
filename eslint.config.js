import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'node_modules'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],

      // AGENTS.md のコーディング規約「any 禁止」を lint で強制する
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],

      // 個人情報をログに出さない規約の機械的な担保（warn/error は残す）
      'no-console': ['error', { allow: ['warn', 'error'] }],

      // トークン漏れ・XSS の温床を禁止する
      'no-restricted-properties': [
        'error',
        {
          object: 'window',
          property: 'eval',
          message: 'eval は使わない',
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: 'JSXAttribute[name.name="dangerouslySetInnerHTML"]',
          message:
            'dangerouslySetInnerHTML は禁止（docs/architecture.md のセキュリティ上の前提）。PAT を localStorage に置くため XSS を持ち込まないことが唯一の防壁。',
        },
      ],
    },
  },
)
