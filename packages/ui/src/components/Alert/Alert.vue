<script setup lang="ts">
import type { MessageArgs, MessageKey } from '@app/i18n'
import { computed } from 'vue'

import type { IconName } from '../Icon/icons'
import Icon from '../Icon/Icon.vue'
import IconButton from '../IconButton/IconButton.vue'
import Text from '../Text/Text.vue'

const props = withDefaults(
  defineProps<{
    tone?: 'info' | 'success' | 'warning' | 'danger'
    title?: MessageKey
    k?: MessageKey
    args?: MessageArgs
    dismissible?: boolean
  }>(),
  { tone: 'info' },
)

defineEmits<{ dismiss: [] }>()

const ICONS: Record<'info' | 'success' | 'warning' | 'danger', IconName> = {
  info: 'info',
  success: 'check-circle',
  warning: 'alert',
  danger: 'alert-circle',
}

const role = computed(() => (props.tone === 'danger' ? 'alert' : 'status'))
</script>

<template>
  <div :class="['ui-alert', `ui-alert--${tone}`]" :role="role">
    <Icon :name="ICONS[tone]" class="ui-alert__icon" />
    <div class="ui-alert__body">
      <Text v-if="title" :k="title" weight="semibold" as="p" class="ui-alert__title" />
      <Text v-if="k" :k="k" :args="args" as="p" class="ui-alert__text" />
      <slot />
    </div>
    <IconButton
      v-if="dismissible"
      icon-only="x"
      ariaLabel="ui.alert.dismiss"
      size="sm"
      @click="$emit('dismiss')"
    />
  </div>
</template>

<style scoped>
.ui-alert {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
  padding: var(--space-4);
  border: 1px solid currentcolor;
  border-radius: var(--radius-md);
  background: var(--color-surface-muted);
  color: var(--color-text);
}

.ui-alert__icon {
  margin-block-start: 2px;
}

.ui-alert__body {
  flex: 1;
  min-width: 0;
}

.ui-alert__body > * + * {
  margin-block-start: var(--space-1);
}

.ui-alert :deep(.ui-text) {
  color: var(--color-text);
}

.ui-alert--info {
  background: var(--color-accent-subtle);
  color: var(--color-accent);
}

.ui-alert--success {
  background: var(--color-success-subtle);
  color: var(--color-success);
}

.ui-alert--warning {
  background: var(--color-warning-subtle);
  color: var(--color-warning);
}

.ui-alert--danger {
  background: var(--color-danger-subtle);
  color: var(--color-danger);
}
</style>
