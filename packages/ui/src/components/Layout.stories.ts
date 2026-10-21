import type { Meta, StoryObj } from '@storybook/vue3-vite'

import Container from './Container/Container.vue'
import Divider from './Divider/Divider.vue'
import Grid from './Grid/Grid.vue'
import Icon from './Icon/Icon.vue'
import { icons } from './Icon/icons'
import IconButton from './IconButton/IconButton.vue'
import Inline from './Inline/Inline.vue'
import Section from './Section/Section.vue'
import Stack from './Stack/Stack.vue'
import Surface from './Surface/Surface.vue'
import Text from './Text/Text.vue'

const meta: Meta = { title: 'Компоновка/Обзор', parameters: { layout: 'fullscreen' } }
export default meta
type Story = StoryObj

export const StackAndInline: Story = {
  render: () => ({
    components: { Stack, Inline, Surface, Text, Divider },
    template: `
      <div style="padding: 16px">
        <Stack :gap="4">
          <Inline :gap="3" wrap><Surface :padding="3"><Text k="demo.text" /></Surface><Surface :padding="3"><Text k="demo.text" /></Surface></Inline>
          <Divider />
          <Inline justify="between"><Text k="demo.label" /><Text k="demo.label" tone="muted" /></Inline>
        </Stack>
      </div>`,
  }),
}

export const Cards: Story = {
  render: () => ({
    components: { Grid, Surface, Text },
    template: `
      <div style="padding: 16px">
        <Grid :cols="{ base: 1, md: 2, lg: 3 }" :gap="4">
          <Surface v-for="n in 6" :key="n"><Text k="demo.title" variant="h3" as="p" /><Text k="demo.long" tone="muted" as="p" /></Surface>
        </Grid>
      </div>`,
  }),
}

export const CardsDark: Story = { ...Cards, globals: { theme: 'dark' } }

export const Sections: Story = {
  render: () => ({
    components: { Section, Container, Text },
    template: `
      <div>
        <Section tone="default"><Container><Text k="demo.title" variant="h2" as="p" /></Container></Section>
        <Section tone="muted"><Container><Text k="demo.title" variant="h2" as="p" /></Container></Section>
        <Section tone="accent"><Container size="md"><Text k="demo.title" variant="h2" as="p" /></Container></Section>
      </div>`,
  }),
}

export const SurfaceTones: Story = {
  render: () => ({
    components: { Surface, Text },
    template: `
      <div style="padding: 16px; display: flex; gap: 16px; flex-wrap: wrap">
        <Surface tone="default" shadow="md"><Text k="demo.text" /></Surface>
        <Surface tone="muted" :bordered="false" shadow="none"><Text k="demo.text" /></Surface>
        <Surface tone="accent" radius="sm" shadow="lg"><Text k="demo.text" /></Surface>
      </div>`,
  }),
}

export const IconGallery: Story = {
  render: () => ({
    components: { Icon, IconButton, Text },
    setup: () => ({ names: Object.keys(icons) }),
    template: `
      <div style="padding: 16px; display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 16px">
        <div v-for="name in names" :key="name" style="display: flex; flex-direction: column; align-items: center; gap: 8px">
          <Icon :name="name" size="lg" />
          <Text k="demo.label" variant="caption" tone="muted" />
        </div>
        <IconButton icon-only="menu" aria-label="demo.menu" />
      </div>`,
  }),
}
