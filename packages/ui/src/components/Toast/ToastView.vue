<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'

import type { ToastItem } from '../../composables/useToast'
import Button from '../Button/Button.vue'
import type { IconName } from '../Icon/icons'
import Icon from '../Icon/Icon.vue'
import IconButton from '../IconButton/IconButton.vue'
import Text from '../Text/Text.vue'

const props = defineProps<{ item: ToastItem }>()
const emit = defineEmits<{ dismiss: [id: number] }>()

const ICONS: Record<ToastItem['tone'], IconName> = {
  success: 'check-circle',
  error: 'alert-circle',
  info: 'info',
  warning: 'alert',
}

let timer: ReturnType<typeof setTimeout> | undefined
let remaining = props.item.duration
let startedAt = 0

function start(): void {
  stop()
  startedAt = Date.now()
  timer = setTimeout(() => emit('dismiss', props.item.id), remaining)
}

function stop(): void {
  if (timer !== undefined) clearTimeout(timer)
  timer = undefined
}

/** Пауза при наведении и фокусе: оставшееся время сохраняется. */
function pause(): void {
  if (timer === undefined) return
  remaining = Math.max(0, remaining - (Date.now() - startedAt))
  stop()
}

function runAction(): void {
  props.item.action?.onClick()
  emit('dismiss', props.item.id)
}

onMounted(start)
onBeforeUnmount(stop)
</script>

<template>
  <div
    :class="['ui-toast', `ui-toast--${item.tone}`]"
    @mouseenter="pause"
    @mouseleave="start"
    @focusin="pause"
    @focusout="start"
  >
    <Icon :name="ICONS[item.tone]" class="ui-toast__icon" />
    <Text :k="item.k" :args="item.args" as="p" class="ui-toast__text" />
    <Button
      v-if="item.action"
      :label="item.action.label"
      variant="link"
      size="sm"
      @click="runAction"
    />
    <IconButton
      icon-only="x"
      ariaLabel="ui.toast.dismiss"
      size="sm"
      @click="emit('dismiss', item.id)"
    />
  </div>
</template>

<style scoped>
.ui-toast {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-width: min(20rem, calc(100vw - var(--space-8)));
  max-width: 28rem;
  padding: var(--space-3) var(--space-4);
  background: var(--color-surface-raised);
  border: 1px solid var(--color-border-strong);
  border-inline-start-width: 4px;
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg);
  color: var(--color-text);
}

.ui-toast__text {
  flex: 1;
}

.ui-toast--success {
  border-inline-start-color: var(--color-success);
}

.ui-toast--success .ui-toast__icon {
  color: var(--color-success);
}

.ui-toast--error {
  border-inline-start-color: var(--color-danger);
}

.ui-toast--error .ui-toast__icon {
  color: var(--color-danger);
}

.ui-toast--info {
  border-inline-start-color: var(--color-accent);
}

.ui-toast--info .ui-toast__icon {
  color: var(--color-accent);
}

.ui-toast--warning {
  border-inline-start-color: var(--color-warning);
}

.ui-toast--warning .ui-toast__icon {
  color: var(--color-warning);
}
</style>
