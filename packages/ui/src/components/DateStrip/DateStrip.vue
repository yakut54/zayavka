<script setup lang="ts">
import type { MessageKey } from '@app/i18n'
import { nextTick, onMounted, ref, watch } from 'vue'

export interface DayItem {
  /** Календарная дата YYYY-MM-DD (день в часовом поясе бизнеса, без времени). */
  date: string
  available: boolean
}

const props = defineProps<{
  days: DayItem[]
  modelValue?: string
  label: MessageKey
}>()

const emit = defineEmits<{ 'update:modelValue': [date: string]; 'reach-end': [] }>()

const list = ref<HTMLElement | null>(null)

// Дата без времени: форматируем в UTC, чтобы пояс браузера не сдвигал число.
const weekdayFormat = new Intl.DateTimeFormat('ru-RU', { weekday: 'short', timeZone: 'UTC' })
const dayFormat = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', timeZone: 'UTC' })
const fullFormat = new Intl.DateTimeFormat('ru-RU', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  timeZone: 'UTC',
})

const asDate = (date: string) => new Date(`${date}T00:00:00Z`)

function enabledIndexes(): number[] {
  return props.days.flatMap((day, index) => (day.available ? [index] : []))
}

/** Фокус-цель: выбранный день, иначе первый доступный. */
function tabbable(): number {
  const selected = props.days.findIndex((d) => d.date === props.modelValue && d.available)
  return selected >= 0 ? selected : (enabledIndexes()[0] ?? -1)
}

function focusDay(index: number): void {
  const button = list.value?.querySelectorAll<HTMLElement>('[role="option"]')[index]
  button?.focus()
  button?.scrollIntoView?.({ inline: 'nearest', block: 'nearest' })
}

function onKeydown(event: KeyboardEvent, index: number): void {
  const enabled = enabledIndexes()
  const position = enabled.indexOf(index)
  const next =
    event.key === 'ArrowRight' || event.key === 'ArrowDown'
      ? enabled[position + 1]
      : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
        ? enabled[position - 1]
        : event.key === 'Home'
          ? enabled[0]
          : event.key === 'End'
            ? enabled[enabled.length - 1]
            : undefined
  if (next !== undefined) {
    event.preventDefault()
    focusDay(next)
  }
  if (event.key === 'ArrowRight' && next === undefined) emit('reach-end')
}

function onScroll(): void {
  const el = list.value
  if (el && el.scrollLeft + el.clientWidth >= el.scrollWidth - 4) emit('reach-end')
}

function select(day: DayItem): void {
  if (day.available) emit('update:modelValue', day.date)
}

async function revealSelected(): Promise<void> {
  await nextTick()
  const el = list.value?.querySelector<HTMLElement>('[aria-selected="true"]')
  el?.scrollIntoView?.({ inline: 'center', block: 'nearest' })
}

onMounted(revealSelected)
watch(() => props.modelValue, revealSelected)
</script>

<template>
  <div
    ref="list"
    class="ui-date-strip"
    role="listbox"
    aria-orientation="horizontal"
    :aria-label="$t(label)"
    @scroll.passive="onScroll"
  >
    <button
      v-for="(day, index) in days"
      :key="day.date"
      type="button"
      role="option"
      class="ui-date-strip__day"
      :aria-selected="day.date === modelValue"
      :aria-disabled="!day.available"
      :aria-label="fullFormat.format(asDate(day.date))"
      :tabindex="tabbable() === index ? 0 : -1"
      @click="select(day)"
      @keydown="onKeydown($event, index)"
    >
      <span class="ui-date-strip__weekday">{{ weekdayFormat.format(asDate(day.date)) }}</span>
      <span class="ui-date-strip__number">{{ dayFormat.format(asDate(day.date)) }}</span>
    </button>
  </div>
</template>

<style scoped>
.ui-date-strip {
  display: flex;
  gap: var(--space-2);
  padding-block: var(--space-1);
  overflow-x: auto;
  scroll-snap-type: x proximity;
}

.ui-date-strip__day {
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-1);
  min-inline-size: 3.5rem;
  min-block-size: var(--control-height-lg);
  padding: var(--space-2);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  color: var(--color-text);
  font: inherit;
  cursor: pointer;
  scroll-snap-align: center;
}

.ui-date-strip__day[aria-selected='true'] {
  border-color: var(--color-accent);
  background: var(--color-accent);
  color: var(--color-text-inverse);
}

.ui-date-strip__day[aria-disabled='true'] {
  border-style: dashed;
  color: var(--color-text-muted);
  cursor: not-allowed;
}

.ui-date-strip__day:focus-visible {
  outline: var(--focus-ring-width) solid var(--color-focus-ring);
  outline-offset: var(--focus-ring-offset);
}

.ui-date-strip__weekday {
  font-size: var(--text-xs);
  text-transform: uppercase;
}

.ui-date-strip__number {
  font-size: var(--text-lg);
  font-weight: 600;
}
</style>
