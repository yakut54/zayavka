import type { Meta, StoryObj } from '@storybook/vue3-vite'

import Heading from './Heading/Heading.vue'
import Link from './Link/Link.vue'
import Text from './Text/Text.vue'

const meta: Meta = { title: 'Типографика/Обзор' }
export default meta
type Story = StoryObj

export const TextVariants: Story = {
  render: () => ({
    components: { Text },
    template: `
      <div style="display: grid; gap: 8px">
        <Text k="demo.title" variant="display" as="p" />
        <Text k="demo.title" variant="h1" as="p" />
        <Text k="demo.title" variant="h2" as="p" />
        <Text k="demo.title" variant="h3" as="p" />
        <Text k="demo.text" variant="body-lg" as="p" />
        <Text k="demo.text" variant="body" as="p" />
        <Text k="demo.text" variant="body-sm" as="p" />
        <Text k="demo.text" variant="caption" as="p" />
        <Text k="demo.label" variant="label" as="p" />
        <Text k="demo.text" variant="code" as="p" />
      </div>`,
  }),
}

export const TextTones: Story = {
  render: () => ({
    components: { Text },
    template: `
      <div style="display: grid; gap: 8px">
        <Text k="demo.text" tone="default" as="p" />
        <Text k="demo.text" tone="muted" as="p" />
        <Text k="demo.text" tone="accent" as="p" />
        <Text k="demo.text" tone="danger" as="p" />
        <Text k="demo.text" tone="success" as="p" />
        <Text k="demo.text" tone="warning" as="p" />
        <div style="background: var(--color-accent); padding: 8px"><Text k="demo.text" tone="inverse" as="p" /></div>
      </div>`,
  }),
}

export const TextTonesDark: Story = { ...TextTones, globals: { theme: 'dark' } }

export const Plurals: Story = {
  render: () => ({
    components: { Text },
    template: `
      <div style="display: grid; gap: 4px">
        <Text v-for="n in [0, 1, 2, 5, 11, 21, 22, 100]" :key="n" k="demo.items" :plural="n" as="p" />
      </div>`,
  }),
}

export const LongTextClamped: Story = {
  render: () => ({
    components: { Text },
    template: `<div style="max-width: 280px"><Text k="demo.long" :lines="2" as="p" /></div>`,
  }),
}

export const Headings: Story = {
  render: () => ({
    components: { Heading },
    template: `
      <div style="display: grid; gap: 12px">
        <Heading k="demo.title" :level="1" variant="display" />
        <Heading k="demo.title" :level="2" />
        <Heading k="demo.title" :level="3" />
        <Heading k="demo.title" :level="4" align="center" />
      </div>`,
  }),
}

export const Links: Story = {
  render: () => ({
    components: { Link },
    template: `
      <div style="display: flex; gap: 16px; flex-wrap: wrap">
        <Link k="demo.policyLink" href="/privacy" />
        <Link k="demo.policyLink" href="https://example.ru" external />
        <Link k="demo.policyLink" href="/privacy" tone="muted" />
      </div>`,
  }),
}

export const LinksHover: Story = { ...Links, parameters: { pseudo: { hover: true } } }
export const LinksFocus: Story = { ...Links, parameters: { pseudo: { focusVisible: true } } }
