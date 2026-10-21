import '@app/ui/styles.css'
import 'virtual:brand.css'

import { i18n } from '@app/i18n'
import { ViteSSG } from 'vite-ssg'

import App from './App.vue'
import { routes, scrollBehavior } from './router'

// vite-ssg: `createApp` вместо `createApp(App).mount('#app')`
export const createApp = ViteSSG(App, { routes, scrollBehavior }, ({ app }) => {
  app.use(i18n)
})
