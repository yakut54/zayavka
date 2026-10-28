import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [vue()],
  test: {
    environment: 'happy-dom',
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,vue}', 'max.config.ts'],
      exclude: ['src/main.ts', 'src/**/*.test.ts'],
      thresholds: { lines: 85, functions: 80, statements: 85, branches: 75 },
    },
  },
})
