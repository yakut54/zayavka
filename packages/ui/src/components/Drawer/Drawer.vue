<script setup lang="ts">
import type { MessageArgs, MessageKey } from '@app/i18n'
import { onBeforeUnmount, onMounted, ref, useId, watch } from 'vue'

import IconButton from '../IconButton/IconButton.vue'
import Text from '../Text/Text.vue'

const props = withDefaults(
  defineProps<{
    open: boolean
    side?: 'start' | 'end'
    title: MessageKey
    titleArgs?: MessageArgs
  }>(),
  { side: 'end' },
)

const emit = defineEmits<{ 'update:open': [value: boolean]; close: [] }>()

const dialog = ref<HTMLDialogElement | null>(null)
const titleId = `${useId()}-title`

function sync(): void {
  const el = dialog.value
  if (!el) return
  if (props.open && !el.open) el.showModal()
  if (!props.open && el.open) el.close()
}

function close(): void {
  emit('close')
  emit('update:open', false)
}

function onCancel(event: Event): void {
  event.preventDefault()
  close()
}

function onBackdropClick(event: MouseEvent): void {
  if (event.target === dialog.value) close()
}

onMounted(sync)
watch(() => props.open, sync, { flush: 'post' })
onBeforeUnmount(() => dialog.value?.close())
</script>

<template>
  <dialog
    ref="dialog"
    :class="['ui-drawer', `ui-drawer--${side}`]"
    :aria-labelledby="titleId"
    @cancel="onCancel"
    @click="onBackdropClick"
  >
    <div v-if="open" class="ui-drawer__panel">
      <header class="ui-drawer__header">
        <h2 :id="titleId" class="ui-drawer__title">
          <Text :k="title" :args="titleArgs" variant="h3" as="span" />
        </h2>
        <IconButton icon-only="x" ariaLabel="common.close" @click="close" />
      </header>
      <div class="ui-drawer__body"><slot /></div>
    </div>
  </dialog>
</template>

<style scoped>
.ui-drawer {
  position: fixed;
  inset-block: 0;
  width: min(30rem, 100vw);
  max-width: 100vw;
  height: 100dvh;
  max-height: 100dvh;
  margin: 0;
  padding: 0;
  border: 0;
  background: var(--color-surface-raised);
  color: var(--color-text);
  box-shadow: var(--shadow-lg);
  z-index: var(--z-drawer);
}

.ui-drawer--end {
  inset-inline: auto 0;
  animation: ui-drawer-in-end var(--duration-normal) var(--ease-standard);
}

.ui-drawer--start {
  inset-inline: 0 auto;
  animation: ui-drawer-in-start var(--duration-normal) var(--ease-standard);
}

.ui-drawer::backdrop {
  background: var(--color-overlay);
}

.ui-drawer__panel {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.ui-drawer__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-4) var(--space-6);
  border-block-end: 1px solid var(--color-border-strong);
}

.ui-drawer__title {
  margin: 0;
}

.ui-drawer__body {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-6);
}

@keyframes ui-drawer-in-end {
  from {
    transform: translateX(100%);
  }
}

@keyframes ui-drawer-in-start {
  from {
    transform: translateX(-100%);
  }
}

@media (max-width: 640px) {
  .ui-drawer {
    width: 100vw;
  }
}
</style>
