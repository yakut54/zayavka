<script setup lang="ts">
import { computed } from 'vue'

import { type SpaceToken, space } from '../layout/types'

export interface GridCols {
  base: number
  md?: number
  lg?: number
}

const props = withDefaults(
  defineProps<{
    cols?: GridCols
    gap?: SpaceToken
    as?: 'div' | 'ul' | 'ol'
  }>(),
  { cols: () => ({ base: 1 }), gap: 4, as: 'div' },
)

const style = computed(() => {
  const { base, md = base, lg = md } = props.cols
  return {
    gap: space(props.gap),
    '--ui-grid-cols': String(base),
    '--ui-grid-cols-md': String(md),
    '--ui-grid-cols-lg': String(lg),
  }
})
</script>

<template>
  <component :is="as" class="ui-grid" :style="style"><slot /></component>
</template>

<style scoped>
.ui-grid {
  display: grid;
  margin: 0;
  padding: 0;
  list-style: none;
  grid-template-columns: repeat(var(--ui-grid-cols), minmax(0, 1fr));
}

@media (min-width: 768px) {
  .ui-grid {
    grid-template-columns: repeat(var(--ui-grid-cols-md), minmax(0, 1fr));
  }
}

@media (min-width: 1024px) {
  .ui-grid {
    grid-template-columns: repeat(var(--ui-grid-cols-lg), minmax(0, 1fr));
  }
}
</style>
