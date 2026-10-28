import type { QueryClient } from '@tanstack/vue-query'
import { type RouteRecordRaw, createRouter, createWebHistory } from 'vue-router'

import { meQueryOptions } from './features/auth/useAuth'
import { ME_KEY } from './queryClient'

export const routes: RouteRecordRaw[] = [
  { path: '/', redirect: '/leads' },
  {
    path: '/login',
    name: 'login',
    component: () => import('./pages/LoginPage.vue'),
    meta: { public: true },
  },
  {
    path: '/leads/:id?',
    name: 'leads',
    component: () => import('./pages/LeadsPage.vue'),
    meta: { shell: true },
  },
  {
    path: '/bookings/:id?',
    name: 'bookings',
    component: () => import('./pages/BookingsPage.vue'),
    meta: { shell: true },
  },
  {
    path: '/resources/:id?',
    name: 'resources',
    component: () => import('./pages/ResourcesPage.vue'),
    meta: { shell: true },
  },
  {
    path: '/booking-settings',
    name: 'booking-settings',
    component: () => import('./pages/BookingSettingsPage.vue'),
    meta: { shell: true },
  },
  {
    path: '/account',
    name: 'account',
    component: () => import('./pages/AccountPage.vue'),
    meta: { shell: true },
  },
  { path: '/:pathMatch(.*)*', redirect: '/leads' },
]

/** Защищённые маршруты проверяют сессию запросом `GET /auth/me` (результат кэшируется). */
export function createAppRouter(queryClient: QueryClient, history = createWebHistory()) {
  const router = createRouter({ history, routes })

  router.beforeEach(async (to) => {
    if (to.meta.public) {
      // уже вошедшего администратора со страницы входа отправляем к заявкам
      return queryClient.getQueryData(ME_KEY) ? { path: '/leads' } : true
    }
    try {
      await queryClient.fetchQuery(meQueryOptions())
      return true
    } catch {
      return { name: 'login', query: { next: to.fullPath } }
    }
  })

  return router
}
