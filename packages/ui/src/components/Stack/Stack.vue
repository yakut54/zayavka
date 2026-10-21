<script setup lang="ts">
import type { SpaceToken } from '../layout/types'

withDefaults(
  defineProps<{
    gap?: SpaceToken
    align?: 'start' | 'center' | 'end' | 'stretch'
    as?: 'div' | 'ul' | 'ol' | 'section' | 'form' | 'nav' | 'li' | 'article' | 'header' | 'footer'
  }>(),
  { gap: 4, align: 'stretch', as: 'div' },
)
</script>

<template>
  <component :is="as" :class="['ui-stack', `ui-stack--${align}`, `ui-stack--gap-${gap}`]">
    <slot />
  </component>
</template>

<style scoped>
.ui-stack {
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 0;
  list-style: none;
}

.ui-stack--start {
  align-items: flex-start;
}

.ui-stack--center {
  align-items: center;
}

.ui-stack--end {
  align-items: flex-end;
}

.ui-stack--stretch {
  align-items: stretch;
}

.ui-stack--gap-1 {
  gap: var(--space-1);
}

.ui-stack--gap-2 {
  gap: var(--space-2);
}

.ui-stack--gap-3 {
  gap: var(--space-3);
}

.ui-stack--gap-4 {
  gap: var(--space-4);
}

.ui-stack--gap-5 {
  gap: var(--space-5);
}

.ui-stack--gap-6 {
  gap: var(--space-6);
}

.ui-stack--gap-8 {
  gap: var(--space-8);
}

.ui-stack--gap-10 {
  gap: var(--space-10);
}

.ui-stack--gap-12 {
  gap: var(--space-12);
}

.ui-stack--gap-16 {
  gap: var(--space-16);
}

.ui-stack--gap-20 {
  gap: var(--space-20);
}
</style>
