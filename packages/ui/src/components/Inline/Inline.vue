<script setup lang="ts">
import type { SpaceToken } from '../layout/types'

withDefaults(
  defineProps<{
    gap?: SpaceToken
    align?: 'start' | 'center' | 'end' | 'baseline' | 'stretch'
    justify?: 'start' | 'center' | 'end' | 'between'
    wrap?: boolean
    as?: 'div' | 'ul' | 'ol' | 'nav' | 'li' | 'header' | 'footer'
  }>(),
  { gap: 3, align: 'center', justify: 'start', wrap: false, as: 'div' },
)
</script>

<template>
  <component
    :is="as"
    :class="[
      'ui-inline',
      `ui-inline--align-${align}`,
      `ui-inline--justify-${justify}`,
      `ui-inline--gap-${gap}`,
      { 'ui-inline--wrap': wrap },
    ]"
  >
    <slot />
  </component>
</template>

<style scoped>
.ui-inline {
  display: flex;
  flex-direction: row;
  margin: 0;
  padding: 0;
  list-style: none;
}

.ui-inline--wrap {
  flex-wrap: wrap;
}

.ui-inline--align-start {
  align-items: flex-start;
}

.ui-inline--align-center {
  align-items: center;
}

.ui-inline--align-end {
  align-items: flex-end;
}

.ui-inline--align-baseline {
  align-items: baseline;
}

.ui-inline--align-stretch {
  align-items: stretch;
}

.ui-inline--justify-start {
  justify-content: flex-start;
}

.ui-inline--justify-center {
  justify-content: center;
}

.ui-inline--justify-end {
  justify-content: flex-end;
}

.ui-inline--justify-between {
  justify-content: space-between;
}

.ui-inline--gap-1 {
  gap: var(--space-1);
}

.ui-inline--gap-2 {
  gap: var(--space-2);
}

.ui-inline--gap-3 {
  gap: var(--space-3);
}

.ui-inline--gap-4 {
  gap: var(--space-4);
}

.ui-inline--gap-5 {
  gap: var(--space-5);
}

.ui-inline--gap-6 {
  gap: var(--space-6);
}

.ui-inline--gap-8 {
  gap: var(--space-8);
}

.ui-inline--gap-10 {
  gap: var(--space-10);
}

.ui-inline--gap-12 {
  gap: var(--space-12);
}

.ui-inline--gap-16 {
  gap: var(--space-16);
}

.ui-inline--gap-20 {
  gap: var(--space-20);
}
</style>
