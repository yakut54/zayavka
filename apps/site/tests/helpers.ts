import { i18n } from '@app/i18n'
import { createHead } from '@unhead/vue/client'
import { flushPromises, mount } from '@vue/test-utils'
import { expect, vi } from 'vitest'
import { axe } from 'vitest-axe'
import { type Component } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'

import App from '../src/App.vue'
import { routes } from '../src/router'

export function createTestRouter() {
  return createRouter({ history: createMemoryHistory(), routes })
}

/** Монтирует всё приложение на заданном маршруте (с роутером, i18n и head). */
const HOME_SECTIONS = 6 // services, prices, process, faq, contacts, lead-form

export async function mountApp(path = '/', root: Component = App) {
  const router = createTestRouter()
  const head = createHead()
  await router.push(path)
  await router.isReady()
  const wrapper = mount(root, {
    attachTo: document.body,
    global: { plugins: [router, head, i18n] },
  })
  await flushPromises()
  if (path === '/') {
    // секции главной грузятся лениво: ждём все, иначе на медленной машине тест видит часть страницы
    await vi.waitFor(
      () => {
        expect(wrapper.find('input[name="name"]').exists()).toBe(true)
        expect(wrapper.find('h1').exists()).toBe(true) // герой тоже грузится лениво
        expect(wrapper.findAll('section[id]')).toHaveLength(HOME_SECTIONS)
      },
      { timeout: 10_000 },
    )
  }
  return { wrapper, router, head }
}

export async function expectAccessible(element: Element): Promise<void> {
  const results = await axe(element)
  const violations = results.violations.map((v) => `${v.id}: ${v.help} (${v.nodes.length})`)
  if (violations.length > 0) throw new Error(`axe violations:\n${violations.join('\n')}`)
}
