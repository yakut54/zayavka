<script setup lang="ts">
import { computed } from 'vue'

export type DateTimeFormat = 'date' | 'time' | 'datetime' | 'weekday-date'

const props = withDefaults(
  defineProps<{
    /** ISO-строка с часовым поясом или Date. */
    value: string | Date
    format?: DateTimeFormat
    /** IANA-пояс; без него — пояс браузера. */
    tz?: string
  }>(),
  { format: 'datetime' },
)

const OPTIONS: Record<DateTimeFormat, Intl.DateTimeFormatOptions> = {
  date: { day: 'numeric', month: 'long' },
  time: { hour: '2-digit', minute: '2-digit' },
  datetime: { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' },
  'weekday-date': { weekday: 'long', day: 'numeric', month: 'long' },
}

const date = computed(() => (props.value instanceof Date ? props.value : new Date(props.value)))
const valid = computed(() => !Number.isNaN(date.value.getTime()))

const text = computed(() =>
  valid.value
    ? new Intl.DateTimeFormat('ru-RU', { ...OPTIONS[props.format], timeZone: props.tz }).format(
        date.value,
      )
    : '',
)
const iso = computed(() => (valid.value ? date.value.toISOString() : undefined))
</script>

<template>
  <time class="ui-datetime" :datetime="iso">{{ text }}</time>
</template>
