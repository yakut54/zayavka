import { fileURLToPath } from 'node:url'

import dictionary from '@app/i18n/ru.json'
import { icons } from '@app/ui/icons'
import VueI18nPlugin from '@intlify/unplugin-vue-i18n/vite'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'
import type { ViteSSGOptions } from 'vite-ssg'

import siteConfig from './site.config'
import { sitePlugin } from './vite/site-plugin'

const ssgOptions: ViteSSGOptions = {
  script: 'async',
  formatting: 'minify',
  dirStyle: 'nested',
  includedRoutes: () => ['/', '/privacy', '/consent', '/404'],
  // Секции с ленивой гидратацией подгружаются позже: preload их JS не нужен для первой отрисовки.
  onPageRendered: (_route, html) =>
    html.replace(/<link rel="modulepreload"[^>]*\/assets\/(?:sections|LeadForm|Alert)-[^>]*>/g, ''),
}

export default defineConfig({
  plugins: [
    vue(),
    // Сообщения компилируются при сборке: в бандл попадает только runtime vue-i18n.
    VueI18nPlugin({
      include: [fileURLToPath(new URL('../../packages/i18n/src/ru.json', import.meta.url))],
      runtimeOnly: true,
      compositionOnly: true,
      dropMessageCompiler: true,
    }),
    sitePlugin({
      config: siteConfig,
      dictionary,
      iconNames: Object.keys(icons),
      apiServicesPath: fileURLToPath(new URL('../api/services.json', import.meta.url)),
    }),
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    port: 5173,
    proxy: { '/api': { target: 'http://localhost:8000', changeOrigin: false } },
  },
  // Один CSS-файл: меньше блокирующих запросов (инлайн-стили запрещены CSP).
  build: {
    target: 'es2022',
    cssCodeSplit: false,
    rolldownOptions: {
      output: {
        // Меньше запросов на критическом пути: общий код — в vendor, секции страницы — в sections,
        // zod нужен только форме и остаётся в её ленивом чанке.
        codeSplitting: {
          groups: [
            {
              name: 'vendor',
              test: /node_modules[\\/](?!.*zod)|packages[\\/](ui|i18n)[\\/]/,
              priority: 20,
            },
            {
              name: 'sections',
              test: /apps[\\/]site[\\/]src[\\/]sections[\\/](?!SiteHeader|MobileMenu|CookieBanner)/,
              priority: 10,
            },
          ],
        },
      },
    },
  },
  ssgOptions,
})
