import { createConfig } from './packages/config/eslint.base.js'

export default createConfig({ ignores: ['apps/api/**', 'infra/**'] })
