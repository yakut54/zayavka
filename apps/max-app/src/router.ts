import { type RouteRecordRaw, createMemoryHistory, createRouter } from 'vue-router'

export const routes: RouteRecordRaw[] = [
  { path: '/', name: 'home', component: () => import('./pages/HomePage.vue') },
  { path: '/:pathMatch(.*)*', redirect: '/' },
]

/** Память вместо адресной строки (MUST): параметры запуска MAX лежат во фрагменте URL. */
export function createAppRouter(history = createMemoryHistory()) {
  return createRouter({ history, routes })
}
