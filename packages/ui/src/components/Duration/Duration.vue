<script setup lang="ts">
import { computed } from 'vue'

import Text from '../Text/Text.vue'

const props = defineProps<{ minutes: number }>()

const message = computed(() => {
  const total = Math.max(0, Math.round(props.minutes))
  const hours = Math.floor(total / 60)
  const rest = total % 60
  if (hours === 0) return { k: 'ui.duration.minutes', args: { n: rest } } as const
  if (rest === 0) return { k: 'ui.duration.hours', args: { n: hours } } as const
  return { k: 'ui.duration.hoursMinutes', args: { h: hours, m: rest } } as const
})
</script>

<template>
  <Text :k="message.k" :args="message.args" class="ui-duration" />
</template>
