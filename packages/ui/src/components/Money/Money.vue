<script setup lang="ts">
import { computed } from 'vue'

import Text from '../Text/Text.vue'

const props = defineProps<{
  amount: number
  /** «от 1 500 ₽». */
  from?: boolean
}>()

const formatter = new Intl.NumberFormat('ru-RU', {
  style: 'currency',
  currency: 'RUB',
  maximumFractionDigits: 0,
})

const formatted = computed(() => formatter.format(props.amount))
</script>

<template>
  <Text v-if="from" k="ui.money.from" :args="{ amount: formatted }" class="ui-money" />
  <span v-else class="ui-money">{{ formatted }}</span>
</template>
