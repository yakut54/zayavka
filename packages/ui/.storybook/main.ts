import type { StorybookConfig } from '@storybook/vue3-vite'

const config: StorybookConfig = {
  stories: ['../src/**/*.stories.ts'],
  addons: ['@storybook/addon-a11y', 'storybook-addon-pseudo-states'],
  framework: { name: '@storybook/vue3-vite', options: {} },
  core: { disableTelemetry: true },
}

export default config
