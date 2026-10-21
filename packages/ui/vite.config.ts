import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

// Используется Storybook; тесты читают vitest.config.ts.
export default defineConfig({ plugins: [vue()] })
