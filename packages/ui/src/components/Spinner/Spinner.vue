<script setup lang="ts">
import type { MessageKey } from '@app/i18n'

import Text from '../Text/Text.vue'
import VisuallyHidden from '../VisuallyHidden/VisuallyHidden.vue'

withDefaults(defineProps<{ size?: 'sm' | 'md' | 'lg'; label?: MessageKey }>(), {
  size: 'md',
  label: 'common.loading',
})
</script>

<template>
  <span class="ui-spinner" role="status">
    <span :class="['ui-spinner__ring', `ui-spinner__ring--${size}`]" aria-hidden="true" />
    <VisuallyHidden><Text :k="label" /></VisuallyHidden>
  </span>
</template>

<style scoped>
.ui-spinner {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: inherit;
}

.ui-spinner__ring {
  display: block;
  border-radius: var(--radius-full);
  border: 2px solid currentcolor;
  border-right-color: transparent;
  animation: ui-spin 700ms linear infinite;
}

.ui-spinner__ring--sm {
  width: 1rem;
  height: 1rem;
}

.ui-spinner__ring--md {
  width: 1.5rem;
  height: 1.5rem;
}

.ui-spinner__ring--lg {
  width: 2.5rem;
  height: 2.5rem;
  border-width: 3px;
}

@keyframes ui-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .ui-spinner__ring {
    animation-duration: 2s;
  }
}
</style>
