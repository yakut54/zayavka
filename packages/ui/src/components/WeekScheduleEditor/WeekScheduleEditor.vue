<script setup lang="ts">
import type { MessageKey } from '@app/i18n'
import { computed, watch } from 'vue'

import Button from '../Button/Button.vue'
import Checkbox from '../Checkbox/Checkbox.vue'
import IconButton from '../IconButton/IconButton.vue'
import Text from '../Text/Text.vue'
import TimeRangeInput, { type TimeRange } from '../TimeRangeInput/TimeRangeInput.vue'

export type WeekSchedule = Record<number, TimeRange[]>

const DAYS = [1, 2, 3, 4, 5, 6, 7] as const
const STEP = 5
const MINUTES_PER_DAY = 1440
const DEFAULT_INTERVAL: TimeRange = [540, 1080]
const NEW_INTERVAL_LENGTH = 120

const props = defineProps<{
  modelValue: WeekSchedule
  /** Состояние, к которому возвращает «Сбросить изменения»; по умолчанию — значение при открытии. */
  baseline?: WeekSchedule
}>()

const emit = defineEmits<{
  'update:modelValue': [value: WeekSchedule]
  'update:valid': [ok: boolean]
}>()

const clone = (value: WeekSchedule): WeekSchedule =>
  Object.fromEntries(DAYS.map((d) => [d, (value[d] ?? []).map(([s, e]): TimeRange => [s, e])]))
const initial = clone(props.modelValue)

const intervals = (day: number): TimeRange[] => props.modelValue[day] ?? []

function errorOf(day: number): MessageKey | null {
  const list = intervals(day)
  if (list.some(([s, e]) => e <= s)) return 'ui.schedule.errorOrder'
  if (list.some(([s, e]) => s % STEP !== 0 || e % STEP !== 0)) return 'ui.schedule.errorStep'
  const sorted = [...list].sort((a, b) => a[0] - b[0])
  const overlaps = sorted.some((item, i) => i > 0 && item[0] < (sorted[i - 1] as TimeRange)[1])
  return overlaps ? 'ui.schedule.errorOverlap' : null
}

const errors = computed(() => Object.fromEntries(DAYS.map((d) => [d, errorOf(d)])))
const valid = computed(() => DAYS.every((d) => errors.value[d] === null))
watch(valid, (ok) => emit('update:valid', ok), { immediate: true })

function change(day: number, next: TimeRange[]): void {
  emit('update:modelValue', { ...clone(props.modelValue), [day]: next })
}

function toggle(day: number, on: boolean): void {
  change(day, on ? [[...DEFAULT_INTERVAL]] : [])
}

function setInterval(day: number, index: number, value: TimeRange): void {
  change(
    day,
    intervals(day).map((item, i) => (i === index ? value : item)),
  )
}

const lastEnd = (day: number) => Math.max(0, ...intervals(day).map(([, end]) => end))
const canAdd = (day: number) => lastEnd(day) <= MINUTES_PER_DAY - STEP

function add(day: number): void {
  const start = lastEnd(day)
  const end = Math.min(start + NEW_INTERVAL_LENGTH, MINUTES_PER_DAY)
  change(day, [...intervals(day), [start, end]])
}

function remove(day: number, index: number): void {
  change(
    day,
    intervals(day).filter((_, i) => i !== index),
  )
}

function copyMonday(): void {
  const next = clone(props.modelValue)
  for (const day of [2, 3, 4, 5]) next[day] = intervals(1).map(([s, e]): TimeRange => [s, e])
  emit('update:modelValue', next)
}

const reset = () => emit('update:modelValue', clone(props.baseline ?? initial))
const dayKey = (day: number) => `ui.weekdayLong.${day}` as MessageKey
</script>

<template>
  <div class="ui-week">
    <fieldset v-for="day in DAYS" :key="day" class="ui-week__day">
      <legend class="ui-week__legend">
        <Text :k="dayKey(day)" weight="semibold" />
      </legend>
      <Checkbox :model-value="intervals(day).length > 0" @update:model-value="toggle(day, $event)">
        <Text k="ui.schedule.workday" />
      </Checkbox>
      <div class="ui-week__intervals">
        <Text v-if="intervals(day).length === 0" k="ui.schedule.dayOff" tone="muted" />
        <div v-for="(range, index) in intervals(day)" :key="index" class="ui-week__interval">
          <TimeRangeInput
            :model-value="range"
            :step="STEP"
            @update:model-value="setInterval(day, index, $event)"
          />
          <IconButton
            icon-only="x"
            ariaLabel="ui.schedule.removeInterval"
            size="sm"
            @click="remove(day, index)"
          />
        </div>
        <Button
          v-if="intervals(day).length > 0"
          label="ui.schedule.addInterval"
          variant="ghost"
          size="sm"
          :disabled="!canAdd(day)"
          @click="add(day)"
        />
        <Text v-if="errors[day]" :k="errors[day] as MessageKey" tone="danger" role="alert" />
      </div>
    </fieldset>
    <div class="ui-week__actions">
      <Button label="ui.schedule.copyMonday" variant="secondary" size="sm" @click="copyMonday" />
      <Button label="ui.schedule.reset" variant="ghost" size="sm" @click="reset" />
    </div>
  </div>
</template>

<style scoped>
.ui-week {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.ui-week__day {
  display: grid;
  grid-template-columns: 1fr;
  gap: var(--space-2) var(--space-6);
  margin: 0;
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-md);
}

.ui-week__legend {
  padding-inline: var(--space-1);
}

.ui-week__intervals {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-2);
}

.ui-week__interval {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
}

.ui-week__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}
</style>
