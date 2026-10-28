import { fileURLToPath } from 'node:url'

import VueI18nPlugin from '@intlify/unplugin-vue-i18n/vite'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    vue(),
    VueI18nPlugin({
      include: [fileURLToPath(new URL('../../packages/i18n/src/ru.json', import.meta.url))],
      runtimeOnly: true,
      compositionOnly: true,
      dropMessageCompiler: true,
    }),
  ],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: {
    port: 5175,
    proxy: { '/api': { target: 'http://localhost:8000', changeOrigin: false } },
  },
  build: { target: 'es2022', cssCodeSplit: false },
})
