import '@app/ui/styles.css'
import 'virtual:brand.css'

import { i18n } from '@app/i18n'
import { ViteSSG } from 'vite-ssg'
import { z } from 'zod'

import App from './App.vue'
import { routes, scrollBehavior } from './router'

// zod по умолчанию проверяет eval через new Function — при строгом CSP это нарушение script-src
z.config({ jitless: true })

// vite-ssg: `createApp` вместо `createApp(App).mount('#app')`
export const createApp = ViteSSG(
  App,
  { routes, scrollBehavior, base: import.meta.env.BASE_URL },
  ({ app }) => {
    app.use(i18n)
  },
)
