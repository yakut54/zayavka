<script setup lang="ts">
import { computed } from 'vue'

export type TimeRange = [number, number]

const MINUTES_PER_DAY = 1440

const props = withDefaults(
  defineProps<{
    /** [начало, конец] в минутах от полуночи; конец 1440 — полночь следующих суток. */
    modelValue: TimeRange
    /** Шаг времени в минутах. */
    step?: number
    disabled?: boolean
    invalid?: boolean
  }>(),
  { step: 5 },
)

const emit = defineEmits<{ 'update:modelValue': [value: TimeRange] }>()

const pad = (n: number) => String(n).padStart(2, '0')

/** Конец 24:00 нельзя записать в `input type=time`, поэтому показываем его как 00:00. */
function format(minutes: number): string {
  const wrapped = minutes % MINUTES_PER_DAY
  return `${pad(Math.floor(wrapped / 60))}:${pad(wrapped % 60)}`
}

function parse(value: string, isEnd: boolean): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value)
  if (!match) return null
  const minutes = Number(match[1]) * 60 + Number(match[2])
  return isEnd && minutes === 0 ? MINUTES_PER_DAY : minutes
}

function update(event: Event, isEnd: boolean): void {
  const minutes = parse((event.target as HTMLInputElement).value, isEnd)
  if (minutes === null) return // поле очищено или заполнено не до конца
  const [start, end] = props.modelValue
  emit('update:modelValue', isEnd ? [start, minutes] : [minutes, end])
}

const broken = computed(() => {
  const [start, end] = props.modelValue
  return end <= start || start % props.step !== 0 || end % props.step !== 0
})
const flagged = computed(() => props.invalid === true || broken.value)
</script>

<template>
  <div :class="['ui-time-range', { 'ui-time-range--invalid': flagged }]">
    <span class="ui-time-range__sep" aria-hidden="true">{{ $t('ui.timeRange.from') }}</span>
    <input
      class="ui-time-range__input"
      type="time"
      :step="step * 60"
      :value="format(modelValue[0])"
      :disabled="disabled"
      :aria-label="$t('ui.timeRange.start')"
      :aria-invalid="flagged ? 'true' : undefined"
      @input="update($event, false)"
    />
    <span class="ui-time-range__sep" aria-hidden="true">{{ $t('ui.timeRange.to') }}</span>
    <input
      class="ui-time-range__input"
      type="time"
      :step="step * 60"
      :value="format(modelValue[1])"
      :disabled="disabled"
      :aria-label="$t('ui.timeRange.end')"
      :aria-invalid="flagged ? 'true' : undefined"
      @input="update($event, true)"
    />
  </div>
</template>

<style scoped>
.ui-time-range {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
}

.ui-time-range__sep {
  color: var(--color-text-muted);
}

.ui-time-range__input {
  min-block-size: var(--control-height-md);
  padding: 0 var(--space-3);
  border: 1px solid var(--color-border-input);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  color: var(--color-text);
  font: inherit;
  font-variant-numeric: tabular-nums;
}

.ui-time-range__input:focus {
  border-color: var(--color-focus-ring);
  outline: var(--focus-ring-width) solid var(--color-focus-ring);
  outline-offset: 0;
}

.ui-time-range--invalid .ui-time-range__input {
  border-color: var(--color-danger);
}

.ui-time-range__input:disabled {
  background: var(--color-surface-muted);
  opacity: 0.6;
}
</style>
