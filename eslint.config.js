import { createConfig } from './packages/config/eslint.base.js'

const bridgeOnly = [
  { object: 'window', property: 'WebApp', message: 'Мост MAX — только через useMaxBridge().' },
  { object: 'globalThis', property: 'WebApp', message: 'Мост MAX — только через useMaxBridge().' },
]

export default [
  ...createConfig({ ignores: ['apps/api/**', 'infra/**'] }),
  {
    files: ['apps/max-app/**'],
    ignores: ['apps/max-app/src/bridge/**', 'apps/max-app/tests/**'],
    rules: {
      'no-restricted-globals': [
        'error',
        { name: 'WebApp', message: 'Мост MAX — только через useMaxBridge().' },
      ],
      'no-restricted-properties': ['error', ...bridgeOnly],
    },
  },
]
