import type { Meta, StoryObj } from '@storybook/vue3-vite'
import { ref } from 'vue'

import { useToast } from '../composables/useToast'
import Accordion from './Accordion/Accordion.vue'
import Alert from './Alert/Alert.vue'
import Badge from './Badge/Badge.vue'
import Button from './Button/Button.vue'
import Dialog from './Dialog/Dialog.vue'
import Drawer from './Drawer/Drawer.vue'
import EmptyState from './EmptyState/EmptyState.vue'
import ErrorState from './ErrorState/ErrorState.vue'
import Skeleton from './Skeleton/Skeleton.vue'
import Spinner from './Spinner/Spinner.vue'
import ToastRegion from './Toast/ToastRegion.vue'

const meta: Meta = { title: 'Обратная связь/Обзор' }
export default meta
type Story = StoryObj

export const Spinners: Story = {
  render: () => ({
    components: { Spinner },
    template: `<div style="display: flex; gap: 16px; align-items: center"><Spinner size="sm" /><Spinner size="md" /><Spinner size="lg" /></div>`,
  }),
}

export const Alerts: Story = {
  render: () => ({
    components: { Alert },
    template: `
      <div style="display: grid; gap: 12px; max-width: 480px">
        <Alert tone="info" title="demo.title" k="demo.text" />
        <Alert tone="success" k="demo.text" dismissible />
        <Alert tone="warning" k="demo.text" />
        <Alert tone="danger" title="demo.title" k="demo.long" dismissible />
      </div>`,
  }),
}

export const AlertsDark: Story = { ...Alerts, globals: { theme: 'dark' } }

export const Badges: Story = {
  render: () => ({
    components: { Badge },
    template: `
      <div style="display: flex; gap: 8px; flex-wrap: wrap">
        <Badge k="demo.text" tone="neutral" /><Badge k="demo.text" tone="accent" />
        <Badge k="demo.text" tone="success" /><Badge k="demo.text" tone="warning" />
        <Badge k="demo.text" tone="danger" /><Badge k="demo.text" tone="muted" />
      </div>`,
  }),
}

export const BadgesDark: Story = { ...Badges, globals: { theme: 'dark' } }

export const Skeletons: Story = {
  render: () => ({
    components: { Skeleton },
    template: `<div style="display: grid; gap: 16px; max-width: 320px"><Skeleton /><Skeleton :lines="3" /><Skeleton width="50%" height="2rem" /></div>`,
  }),
}

export const EmptyAndError: Story = {
  render: () => ({
    components: { EmptyState, ErrorState, Button },
    template: `
      <div style="display: grid; gap: 24px">
        <EmptyState title="demo.emptyTitle" description="demo.emptyText"><Button label="demo.action" variant="secondary" /></EmptyState>
        <ErrorState code="network" />
        <ErrorState />
      </div>`,
  }),
}

export const ToastDemo: Story = {
  render: () => ({
    components: { Button, ToastRegion },
    setup() {
      const toast = useToast()
      return {
        success: () => toast.success('demo.greeting', { name: 'Анна' }),
        error: () =>
          toast.error('demo.text', undefined, {
            action: { label: 'common.retry', onClick: () => undefined },
          }),
      }
    },
    template: `
      <div style="display: flex; gap: 12px">
        <Button label="demo.action" @click="success" />
        <Button label="demo.action" variant="danger" @click="error" />
        <ToastRegion />
      </div>`,
  }),
}

export const AccordionFirstOpen: Story = {
  render: () => ({
    components: { Accordion },
    setup: () => ({
      items: [
        { id: 'q1', title: 'demo.faqQ1', body: 'demo.faqA1' },
        { id: 'q2', title: 'demo.faqQ2', body: 'demo.faqA2' },
      ],
    }),
    template: `<div style="max-width: 560px"><Accordion :items="items" open-id="q1" /></div>`,
  }),
}

export const AccordionDark: Story = { ...AccordionFirstOpen, globals: { theme: 'dark' } }

export const DialogOpen: Story = {
  render: () => ({
    components: { Dialog },
    setup: () => ({ open: ref(true) }),
    template: `<Dialog v-model:open="open" title="demo.title" description="demo.dialogText" confirm-label="demo.confirm" />`,
  }),
}

export const DialogDanger: Story = {
  render: () => ({
    components: { Dialog },
    setup: () => ({ open: ref(true) }),
    template: `<Dialog v-model:open="open" title="demo.title" description="demo.dialogText" confirm-label="demo.confirm" tone="danger" />`,
  }),
}

export const DialogLoading: Story = {
  render: () => ({
    components: { Dialog },
    setup: () => ({ open: ref(true) }),
    template: `<Dialog v-model:open="open" title="demo.title" description="demo.dialogText" confirm-label="demo.confirm" loading />`,
  }),
}

export const DrawerOpen: Story = {
  render: () => ({
    components: { Drawer, Skeleton },
    setup: () => ({ open: ref(true) }),
    template: `<Drawer v-model:open="open" title="demo.title"><Skeleton :lines="4" /></Drawer>`,
  }),
}

export const DrawerStart: Story = {
  render: () => ({
    components: { Drawer, Skeleton },
    setup: () => ({ open: ref(true) }),
    template: `<Drawer v-model:open="open" side="start" title="demo.title"><Skeleton :lines="4" /></Drawer>`,
  }),
}

export const DrawerDark: Story = { ...DrawerOpen, globals: { theme: 'dark' } }
