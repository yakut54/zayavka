<script setup lang="ts">
import type { MessageKey } from '@app/i18n'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import { type IconName, icons } from './icons'

const props = withDefaults(
  defineProps<{
    name: IconName
    size?: 'sm' | 'md' | 'lg'
    label?: MessageKey
  }>(),
  { size: 'md' },
)

const { t } = useI18n()
const paths = computed(() => icons[props.name])
const accessible = computed(() =>
  props.label
    ? { role: 'img', 'aria-label': t(props.label) }
    : { 'aria-hidden': 'true' as const, focusable: 'false' },
)
</script>

<template>
  <svg
    :class="['ui-icon', `ui-icon--${size}`]"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    v-bind="accessible"
  >
    <path v-for="d in paths" :key="d" :d="d" />
  </svg>
</template>

<style scoped>
.ui-icon {
  flex: none;
  display: inline-block;
}

.ui-icon--sm {
  width: 1rem;
  height: 1rem;
}

.ui-icon--md {
  width: 1.25rem;
  height: 1.25rem;
}

.ui-icon--lg {
  width: 1.75rem;
  height: 1.75rem;
}
</style>
