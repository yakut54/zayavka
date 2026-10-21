<script setup lang="ts">
import { computed } from 'vue'

import { type SpaceToken, space } from '../layout/types'

const props = withDefaults(
  defineProps<{
    padding?: SpaceToken
    radius?: 'sm' | 'md' | 'lg'
    shadow?: 'none' | 'sm' | 'md' | 'lg'
    tone?: 'default' | 'muted' | 'accent'
    bordered?: boolean
    as?: 'div' | 'section' | 'article' | 'li' | 'aside' | 'form'
  }>(),
  { padding: 6, radius: 'lg', shadow: 'sm', tone: 'default', bordered: true, as: 'div' },
)

const style = computed(() => ({ padding: space(props.padding) }))
</script>

<template>
  <component
    :is="as"
    :class="[
      'ui-surface',
      `ui-surface--radius-${radius}`,
      `ui-surface--shadow-${shadow}`,
      `ui-surface--${tone}`,
      { 'ui-surface--bordered': bordered },
    ]"
    :style="style"
  >
    <slot />
  </component>
</template>

<style scoped>
.ui-surface {
  background: var(--color-surface);
  color: var(--color-text);
}

.ui-surface--bordered {
  border: 1px solid var(--color-border-strong);
}

.ui-surface--muted {
  background: var(--color-surface-muted);
}

.ui-surface--accent {
  background: var(--color-accent-subtle);
}

.ui-surface--radius-sm {
  border-radius: var(--radius-sm);
}

.ui-surface--radius-md {
  border-radius: var(--radius-md);
}

.ui-surface--radius-lg {
  border-radius: var(--radius-lg);
}

.ui-surface--shadow-none {
  box-shadow: none;
}

.ui-surface--shadow-sm {
  box-shadow: var(--shadow-sm);
}

.ui-surface--shadow-md {
  box-shadow: var(--shadow-md);
}

.ui-surface--shadow-lg {
  box-shadow: var(--shadow-lg);
}
</style>
