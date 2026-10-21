import { i18n } from '@app/i18n'
import type { Preview } from '@storybook/vue3-vite'
import { setup } from '@storybook/vue3-vite'
import { createMemoryHistory, createRouter } from 'vue-router'

import '../src/styles/index.css'

const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/:pathMatch(.*)*', component: { render: () => null } }],
})

setup((app) => {
  app.use(i18n)
  app.use(router)
})

const preview: Preview = {
  parameters: {
    layout: 'padded',
    a11y: { test: 'error' },
    controls: { expanded: true },
  },
  globalTypes: {
    theme: {
      description: 'Тема',
      defaultValue: 'light',
      toolbar: {
        title: 'Тема',
        icon: 'circlehollow',
        items: [
          { value: 'light', title: 'Светлая' },
          { value: 'dark', title: 'Тёмная' },
        ],
        dynamicTitle: true,
      },
    },
  },
  decorators: [
    (story, context) => {
      document.documentElement.dataset.theme = String(context.globals.theme ?? 'light')
      return { components: { story }, template: '<story />' }
    },
  ],
}

export default preview
