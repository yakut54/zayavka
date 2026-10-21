<script setup lang="ts">
import { computed } from 'vue'

import { type SpaceToken, space } from '../layout/types'

const props = withDefaults(
  defineProps<{
    gap?: SpaceToken
    align?: 'start' | 'center' | 'end' | 'stretch'
    as?: 'div' | 'ul' | 'ol' | 'section' | 'form' | 'nav' | 'li' | 'article' | 'header' | 'footer'
  }>(),
  { gap: 4, align: 'stretch', as: 'div' },
)

const style = computed(() => ({ gap: space(props.gap) }))
</script>

<template>
  <component :is="as" :class="['ui-stack', `ui-stack--${align}`]" :style="style"
    ><slot
  /></component>
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
</style>
