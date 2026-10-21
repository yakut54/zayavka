import js from '@eslint/js'
import pluginVue from 'eslint-plugin-vue'
import prettier from 'eslint-config-prettier'
import globals from 'globals'
import tseslint from 'typescript-eslint'

// Символы, которые не считаются «текстом для пользователя» в шаблонах.
const SYMBOLS = [
  '(',
  ')',
  ',',
  '.',
  '&',
  '+',
  '-',
  '=',
  '*',
  '/',
  '#',
  '%',
  '!',
  '?',
  ':',
  '[',
  ']',
  '{',
  '}',
  '<',
  '>',
  '|',
  '·',
  '•',
  '–',
  '—',
  '×',
  '₽',
  '№',
  '✓',
  '✕',
  '←',
  '→',
  '‹',
  '›',
  '«',
  '»',
  '…',
]

/** Общий flat-конфиг ESLint (раздел 18 ТЗ). */
export function createConfig({ ignores = [] } = {}) {
  return tseslint.config(
    {
      ignores: [
        '**/dist/**',
        '**/node_modules/**',
        '**/coverage/**',
        '**/storybook-static/**',
        '**/src/schema.d.ts',
        ...ignores,
      ],
    },
    js.configs.recommended,
    ...tseslint.configs.strict,
    ...pluginVue.configs['flat/recommended'],
    prettier,
    {
      languageOptions: {
        globals: { ...globals.browser, ...globals.node },
        parserOptions: { parser: tseslint.parser },
      },
      rules: {
        'vue/require-default-prop': 'off', // необязательные пропсы типизированы в TS
        'vue/multi-word-component-names': 'off', // имена из ТЗ: Text, Button, Field…
        'vue/attribute-hyphenation': ['error', 'always', { ignore: ['ariaLabel'] }], // проп ariaLabel зафиксирован ТЗ
        'vue/no-v-html': 'error',
        'vue/require-explicit-emits': 'error',
        'vue/component-api-style': ['error', ['script-setup']],
        'vue/block-order': ['error', { order: ['script', 'template', 'style'] }],
        'vue/no-bare-strings-in-template': [
          'error',
          {
            allowlist: SYMBOLS,
            // Пропсы компонентов (title="key") — это ключи словаря; проверяются только нативные элементы.
            attributes: {
              '/^[a-z][a-z0-9]*$/': [
                'title',
                'aria-label',
                'aria-placeholder',
                'aria-roledescription',
                'aria-valuetext',
              ],
              input: ['placeholder'],
              img: ['alt'],
            },
          },
        ],
        '@typescript-eslint/consistent-type-imports': 'error',
        '@typescript-eslint/no-unused-vars': [
          'error',
          { varsIgnorePattern: '^_', argsIgnorePattern: '^_', ignoreRestSiblings: true },
        ],
        'no-restricted-imports': [
          'error',
          {
            patterns: [
              {
                group: [
                  '@app/ui/*',
                  '!@app/ui/styles.css',
                  '!@app/ui/contrast',
                  '!@app/ui/icons',
                  '**/packages/ui/src/**',
                ],
                message: 'Импортируйте UI только из публичного индекса @app/ui.',
              },
            ],
          },
        ],
      },
    },
    {
      // Внутри самого пакета ui относительные импорты допустимы.
      files: ['packages/ui/**'],
      rules: { 'no-restricted-imports': 'off' },
    },
    {
      files: ['**/*.test.ts', '**/*.stories.ts', '**/tests/**', 'e2e/**'],
      rules: {
        '@typescript-eslint/no-non-null-assertion': 'off',
        'vue/one-component-per-file': 'off',
        'vue/no-reserved-component-names': 'off',
      },
    },
  )
}
