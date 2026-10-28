import '@app/ui/styles.css'

import { i18n } from '@app/i18n'
import { VueQueryPlugin } from '@tanstack/vue-query'
import { createPinia } from 'pinia'
import { createApp } from 'vue'
import { z } from 'zod'

import App from './App.vue'
import { createQueryClient } from './queryClient'
import { createAppRouter } from './router'

// zod по умолчанию проверяет eval через new Function — при строгом CSP это нарушение script-src
z.config({ jitless: true })

createApp(App)
  .use(createPinia())
  .use(createAppRouter())
  .use(i18n)
  .use(VueQueryPlugin, { queryClient: createQueryClient() })
  .mount('#app')
