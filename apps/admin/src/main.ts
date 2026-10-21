import '@app/ui/styles.css'

import { i18n } from '@app/i18n'
import { useToast } from '@app/ui'
import { VueQueryPlugin } from '@tanstack/vue-query'
import { createPinia } from 'pinia'
import { createApp } from 'vue'

import App from './App.vue'
import { createQueryClient } from './queryClient'
import { createAppRouter } from './router'
import { useUiStore } from './stores/ui'

const pinia = createPinia()
const toast = useToast()

const queryClient = createQueryClient(() => {
  // 401: очистка кэша → вход с возвратом на текущую страницу → уведомление
  queryClient.clear()
  const current = router.currentRoute.value
  if (current.name === 'login') return
  toast.info('admin.auth.sessionExpired')
  void router.replace({ name: 'login', query: { next: current.fullPath } })
})
const router = createAppRouter(queryClient)

const app = createApp(App)
app.use(pinia).use(router).use(i18n).use(VueQueryPlugin, { queryClient })
useUiStore().init()
app.mount('#app')
