<script setup lang="ts">
import type { SpaceToken } from '../layout/types'

withDefaults(
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
</script>

<template>
  <component
    :is="as"
    :class="[
      'ui-surface',
      `ui-surface--radius-${radius}`,
      `ui-surface--shadow-${shadow}`,
      `ui-surface--${tone}`,
      `ui-surface--p-${padding}`,
      { 'ui-surface--bordered': bordered },
    ]"
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

.ui-surface--p-1 {
  padding: var(--space-1);
}

.ui-surface--p-2 {
  padding: var(--space-2);
}

.ui-surface--p-3 {
  padding: var(--space-3);
}

.ui-surface--p-4 {
  padding: var(--space-4);
}

.ui-surface--p-5 {
  padding: var(--space-5);
}

.ui-surface--p-6 {
  padding: var(--space-6);
}

.ui-surface--p-8 {
  padding: var(--space-8);
}

.ui-surface--p-10 {
  padding: var(--space-10);
}

.ui-surface--p-12 {
  padding: var(--space-12);
}

.ui-surface--p-16 {
  padding: var(--space-16);
}

.ui-surface--p-20 {
  padding: var(--space-20);
}
</style>
