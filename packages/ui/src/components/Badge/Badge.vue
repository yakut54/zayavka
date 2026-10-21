<script setup lang="ts">
import type { MessageArgs, MessageKey } from '@app/i18n'

import Text from '../Text/Text.vue'

withDefaults(
  defineProps<{
    k: MessageKey
    args?: MessageArgs
    tone?: 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'muted'
  }>(),
  { tone: 'neutral' },
)
</script>

<template>
  <span :class="['ui-badge', `ui-badge--${tone}`]">
    <Text :k="k" :args="args" variant="caption" weight="semibold" as="span" />
  </span>
</template>

<style scoped>
.ui-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px var(--space-2);
  border-radius: var(--radius-full);
  white-space: nowrap;
}

.ui-badge :deep(.ui-text) {
  color: inherit;
}

.ui-badge--neutral {
  background: var(--color-surface-muted);
  color: var(--color-text);
}

.ui-badge--muted {
  background: var(--color-surface-muted);
  color: var(--color-text-muted);
}

.ui-badge--accent {
  background: var(--color-accent-subtle);
  color: var(--color-accent);
}

.ui-badge--success {
  background: var(--color-success-subtle);
  color: var(--color-success);
}

.ui-badge--warning {
  background: var(--color-warning-subtle);
  color: var(--color-warning);
}

.ui-badge--danger {
  background: var(--color-danger-subtle);
  color: var(--color-danger);
}
</style>
