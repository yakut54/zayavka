<script setup lang="ts">
import { computed } from 'vue'

import type { SpaceToken } from '../layout/types'

export interface GridCols {
  /** От 1 до 6 колонок. */
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

const classes = computed(() => {
  const { base, md = base, lg = md } = props.cols
  return [
    'ui-grid',
    `ui-grid--gap-${props.gap}`,
    `ui-grid--c-${base}`,
    `ui-grid--md-${md}`,
    `ui-grid--lg-${lg}`,
  ]
})
</script>

<template>
  <component :is="as" :class="classes"><slot /></component>
</template>

<style scoped>
.ui-grid {
  display: grid;
  margin: 0;
  padding: 0;
  list-style: none;
}

.ui-grid--gap-1 {
  gap: var(--space-1);
}

.ui-grid--gap-2 {
  gap: var(--space-2);
}

.ui-grid--gap-3 {
  gap: var(--space-3);
}

.ui-grid--gap-4 {
  gap: var(--space-4);
}

.ui-grid--gap-5 {
  gap: var(--space-5);
}

.ui-grid--gap-6 {
  gap: var(--space-6);
}

.ui-grid--gap-8 {
  gap: var(--space-8);
}

.ui-grid--gap-10 {
  gap: var(--space-10);
}

.ui-grid--gap-12 {
  gap: var(--space-12);
}

.ui-grid--gap-16 {
  gap: var(--space-16);
}

.ui-grid--gap-20 {
  gap: var(--space-20);
}

.ui-grid--c-1 {
  grid-template-columns: repeat(1, minmax(0, 1fr));
}

.ui-grid--c-2 {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.ui-grid--c-3 {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.ui-grid--c-4 {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.ui-grid--c-5 {
  grid-template-columns: repeat(5, minmax(0, 1fr));
}

.ui-grid--c-6 {
  grid-template-columns: repeat(6, minmax(0, 1fr));
}

@media (min-width: 768px) {
  .ui-grid--md-1 {
    grid-template-columns: repeat(1, minmax(0, 1fr));
  }

  .ui-grid--md-2 {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .ui-grid--md-3 {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .ui-grid--md-4 {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  .ui-grid--md-5 {
    grid-template-columns: repeat(5, minmax(0, 1fr));
  }

  .ui-grid--md-6 {
    grid-template-columns: repeat(6, minmax(0, 1fr));
  }
}

@media (min-width: 1024px) {
  .ui-grid--lg-1 {
    grid-template-columns: repeat(1, minmax(0, 1fr));
  }

  .ui-grid--lg-2 {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .ui-grid--lg-3 {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .ui-grid--lg-4 {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  .ui-grid--lg-5 {
    grid-template-columns: repeat(5, minmax(0, 1fr));
  }

  .ui-grid--lg-6 {
    grid-template-columns: repeat(6, minmax(0, 1fr));
  }
}
</style>
