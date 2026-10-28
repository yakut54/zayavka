import { type RouteRecordRaw, createMemoryHistory, createRouter } from 'vue-router'

export const routes: RouteRecordRaw[] = [
  { path: '/', name: 'home', component: () => import('./pages/HomePage.vue') },
  {
    path: '/book/resource',
    name: 'book-resource',
    component: () => import('./pages/ResourcePage.vue'),
  },
  { path: '/book/date', name: 'book-date', component: () => import('./pages/DatePage.vue') },
  { path: '/book/time', name: 'book-time', component: () => import('./pages/TimePage.vue') },
  {
    path: '/book/contacts',
    name: 'book-contacts',
    component: () => import('./pages/ContactsPage.vue'),
  },
  {
    path: '/book/confirm',
    name: 'book-confirm',
    component: () => import('./pages/ConfirmPage.vue'),
  },
  { path: '/done', name: 'done', component: () => import('./pages/DonePage.vue') },
  { path: '/request', name: 'request', component: () => import('./pages/RequestPage.vue') },
  { path: '/:pathMatch(.*)*', redirect: '/' },
]

/** Память вместо адресной строки (MUST): параметры запуска MAX лежат во фрагменте URL. */
export function createAppRouter(history = createMemoryHistory()) {
  return createRouter({ history, routes })
}
