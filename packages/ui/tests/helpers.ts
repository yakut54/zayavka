import { i18n } from '@app/i18n'
import { render, type RenderOptions } from '@testing-library/vue'
import { axe } from 'vitest-axe'
import type { Component } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'

export function createTestRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { render: () => null } },
      { path: '/privacy', component: { render: () => null } },
    ],
  })
}

/** render с i18n и роутером. */
export function renderWithApp(component: Component, options: RenderOptions<Component> = {}) {
  const router = createTestRouter()
  const result = render(component, {
    ...options,
    global: {
      ...options.global,
      plugins: [i18n, router, ...(options.global?.plugins ?? [])],
    },
  })
  return { ...result, router }
}

/** Проверка доступности контейнера: падает при нарушениях axe. */
export async function expectAccessible(container: Element): Promise<void> {
  const results = await axe(container)
  const violations = results.violations.map((v) => `${v.id}: ${v.help} (${v.nodes.length})`)
  if (violations.length > 0) throw new Error(`axe violations:\n${violations.join('\n')}`)
}
