import type { Meta, StoryObj } from '@storybook/vue3-vite'

import Button from './Button.vue'

const meta: Meta = {
  title: 'Действия/Button',
  component: Button as never,
  args: { label: 'demo.action' },
  argTypes: {
    variant: { control: 'select', options: ['primary', 'secondary', 'ghost', 'danger', 'link'] },
    size: { control: 'inline-radio', options: ['sm', 'md', 'lg'] },
  },
}

export default meta
type Story = StoryObj

export const Default: Story = {}
export const Hover: Story = { parameters: { pseudo: { hover: true } } }
export const Active: Story = { parameters: { pseudo: { active: true } } }
export const Focus: Story = { parameters: { pseudo: { focusVisible: true } } }
export const Disabled: Story = { args: { disabled: true } }
export const Loading: Story = { args: { loading: true } }
export const Block: Story = { args: { block: true } }
export const LongText: Story = { args: { label: 'demo.long' }, parameters: { layout: 'centered' } }
export const IconOnly: Story = {
  args: { label: undefined, iconOnly: 'menu', ariaLabel: 'demo.menu' },
}
export const WithIcons: Story = { args: { iconStart: 'phone', iconEnd: 'chevron-right' } }
export const AsLink: Story = { args: { href: 'tel:+70000000000' } }
export const Dark: Story = { globals: { theme: 'dark' } }

export const Variants: Story = {
  render: () => ({
    components: { Button },
    template: `
      <div style="display: flex; gap: 12px; flex-wrap: wrap; align-items: center">
        <Button label="demo.action" variant="primary" />
        <Button label="demo.action" variant="secondary" />
        <Button label="demo.action" variant="ghost" />
        <Button label="demo.action" variant="danger" />
        <Button label="demo.action" variant="link" />
      </div>`,
  }),
}

export const Sizes: Story = {
  render: () => ({
    components: { Button },
    template: `
      <div style="display: flex; gap: 12px; align-items: center">
        <Button label="demo.action" size="sm" />
        <Button label="demo.action" size="md" />
        <Button label="demo.action" size="lg" />
      </div>`,
  }),
}

export const VariantsDark: Story = { ...Variants, globals: { theme: 'dark' } }
