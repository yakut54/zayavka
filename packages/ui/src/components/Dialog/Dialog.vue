<script setup lang="ts">
import type { MessageKey } from '@app/i18n'
import { onBeforeUnmount, onMounted, ref, useId, watch } from 'vue'

import Button from '../Button/Button.vue'
import Text from '../Text/Text.vue'

const props = withDefaults(
  defineProps<{
    open: boolean
    title: MessageKey
    description?: MessageKey
    confirmLabel: MessageKey
    cancelLabel?: MessageKey
    tone?: 'default' | 'danger'
    loading?: boolean
  }>(),
  { cancelLabel: 'common.cancel', tone: 'default' },
)

const emit = defineEmits<{
  'update:open': [value: boolean]
  confirm: []
  cancel: []
}>()

const dialog = ref<HTMLDialogElement | null>(null)
const id = useId()
const titleId = `${id}-title`
const descriptionId = `${id}-description`

function sync(): void {
  const el = dialog.value
  if (!el) return
  if (props.open && !el.open) el.showModal()
  if (!props.open && el.open) el.close()
}

function cancel(): void {
  if (props.loading) return
  emit('cancel')
  emit('update:open', false)
}

function onCancel(event: Event): void {
  // Esc: закрываем сами, чтобы состояние `open` оставалось источником истины.
  event.preventDefault()
  cancel()
}

function onBackdropClick(event: MouseEvent): void {
  if (event.target === dialog.value) cancel()
}

onMounted(sync)
watch(() => props.open, sync, { flush: 'post' })
onBeforeUnmount(() => dialog.value?.close())
</script>

<template>
  <dialog
    ref="dialog"
    class="ui-dialog"
    :aria-labelledby="titleId"
    :aria-describedby="description ? descriptionId : undefined"
    @cancel="onCancel"
    @click="onBackdropClick"
  >
    <div v-if="open" class="ui-dialog__panel">
      <h2 :id="titleId" class="ui-dialog__title"><Text :k="title" variant="h3" as="span" /></h2>
      <Text v-if="description" :id="descriptionId" :k="description" tone="muted" as="p" />
      <slot />
      <div class="ui-dialog__actions">
        <Button :label="cancelLabel" variant="secondary" :disabled="loading" @click="cancel" />
        <Button
          :label="confirmLabel"
          :variant="tone === 'danger' ? 'danger' : 'primary'"
          :loading="loading"
          @click="emit('confirm')"
        />
      </div>
    </div>
  </dialog>
</template>

<style scoped>
.ui-dialog {
  width: min(28rem, calc(100vw - var(--space-8)));
  padding: 0;
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-lg);
  background: var(--color-surface-raised);
  color: var(--color-text);
  box-shadow: var(--shadow-lg);
}

.ui-dialog::backdrop {
  background: var(--color-overlay);
}

.ui-dialog__panel {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  padding: var(--space-6);
}

.ui-dialog__title {
  margin: 0;
}

.ui-dialog__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: var(--space-3);
}
</style>
