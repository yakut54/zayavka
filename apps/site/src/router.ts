import type { RouteRecordRaw, RouterScrollBehavior } from 'vue-router'

const HEADER_OFFSET = 80

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

export const routes: RouteRecordRaw[] = [
  { path: '/', name: 'home', component: () => import('./pages/HomePage.vue') },
  { path: '/privacy', name: 'privacy', component: () => import('./pages/PrivacyPage.vue') },
  { path: '/consent', name: 'consent', component: () => import('./pages/ConsentPage.vue') },
  { path: '/404', name: 'not-found-page', component: () => import('./pages/NotFoundPage.vue') },
  {
    path: '/:pathMatch(.*)*',
    name: 'not-found',
    component: () => import('./pages/NotFoundPage.vue'),
  },
]

export const scrollBehavior: RouterScrollBehavior = (to, _from, saved) => {
  if (saved) return saved
  if (to.hash) {
    return {
      el: to.hash,
      top: HEADER_OFFSET,
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    }
  }
  return { top: 0 }
}
