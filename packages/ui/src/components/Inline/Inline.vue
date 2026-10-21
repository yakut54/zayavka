<script setup lang="ts">
import { computed } from 'vue'

import { type SpaceToken, space } from '../layout/types'

const props = withDefaults(
  defineProps<{
    gap?: SpaceToken
    align?: 'start' | 'center' | 'end' | 'baseline' | 'stretch'
    justify?: 'start' | 'center' | 'end' | 'between'
    wrap?: boolean
    as?: 'div' | 'ul' | 'ol' | 'nav' | 'li' | 'header' | 'footer'
  }>(),
  { gap: 3, align: 'center', justify: 'start', wrap: false, as: 'div' },
)

const style = computed(() => ({ gap: space(props.gap) }))
</script>

<template>
  <component
    :is="as"
    :class="[
      'ui-inline',
      `ui-inline--align-${align}`,
      `ui-inline--justify-${justify}`,
      { 'ui-inline--wrap': wrap },
    ]"
    :style="style"
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
</style>
