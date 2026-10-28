<script setup lang="ts">
import { computed } from 'vue'

export interface GridColumn {
  id: string
  title: string
}

export interface GridEvent {
  id: string
  columnId: string
  startMin: number
  endMin: number
  /** Буфер после записи: рисуется бледным хвостом. */
  bufferMin?: number
  title: string
  subtitle?: string
  /** Полное описание для скринридера: «10:00–11:00, Стрижка, Иван». */
  label: string
  tone?: 'default' | 'success' | 'warning' | 'danger' | 'muted'
}

export interface GridRange {
  columnId: string
  startMin: number
  endMin: number
}

const props = withDefaults(
  defineProps<{
    columns: GridColumn[]
    startMin: number
    endMin: number
    /** Шаг сетки в минутах. */
    step?: number
    events?: GridEvent[]
    /** Нерабочее время колонок. */
    unavailable?: GridRange[]
    /** Текущее время в минутах от полуночи; не задано — линия «сейчас» скрыта. */
    now?: number | null
  }>(),
  { step: 15, events: () => [], unavailable: () => [], now: null },
)

const emit = defineEmits<{
  'select-event': [id: string]
  'select-cell': [cell: { columnId: string; minute: number }]
}>()

const rows = computed(() => Math.max(1, Math.ceil((props.endMin - props.startMin) / props.step)))

const toRows = (minutes: number) => (minutes - props.startMin) / props.step

const hours = computed(() => {
  const first = Math.ceil(props.startMin / 60) * 60
  const marks: { minute: number; text: string }[] = []
  for (let minute = first; minute < props.endMin; minute += 60) {
    marks.push({ minute, text: `${String(Math.floor(minute / 60) % 24).padStart(2, '0')}:00` })
  }
  return marks
})

const byColumn = (column: GridColumn) => ({
  events: props.events.filter((e) => e.columnId === column.id),
  blocks: props.unavailable.filter((r) => r.columnId === column.id),
})

const showNow = computed(
  () => props.now !== null && props.now >= props.startMin && props.now < props.endMin,
)

function onTrackClick(event: MouseEvent, columnId: string): void {
  if (event.target !== event.currentTarget) return
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  const row =
    rect.height > 0 ? Math.floor(((event.clientY - rect.top) / rect.height) * rows.value) : 0
  const clamped = Math.min(rows.value - 1, Math.max(0, row))
  emit('select-cell', { columnId, minute: props.startMin + clamped * props.step })
}
</script>

<template>
  <div class="ui-timegrid" role="group" :aria-label="$t('ui.timeGrid.label')">
    <div class="ui-timegrid__scroll" tabindex="0">
      <div class="ui-timegrid__inner" :style="{ '--cols': columns.length, '--rows': rows }">
        <div class="ui-timegrid__head">
          <span />
          <span v-for="column in columns" :key="column.id" class="ui-timegrid__title">
            {{ column.title }}
          </span>
        </div>
        <div class="ui-timegrid__body">
          <div class="ui-timegrid__gutter">
            <span
              v-for="mark in hours"
              :key="mark.minute"
              class="ui-timegrid__hour"
              :style="{ '--top': toRows(mark.minute) }"
            >
              {{ mark.text }}
            </span>
          </div>
          <div
            v-for="column in columns"
            :key="column.id"
            class="ui-timegrid__track"
            @click="onTrackClick($event, column.id)"
          >
            <div
              v-for="(block, index) in byColumn(column).blocks"
              :key="`u${index}`"
              class="ui-timegrid__off"
              :style="{
                '--top': toRows(block.startMin),
                '--span': toRows(block.endMin) - toRows(block.startMin),
              }"
            />
            <template v-for="event in byColumn(column).events" :key="event.id">
              <div
                v-if="event.bufferMin"
                class="ui-timegrid__buffer"
                :style="{ '--top': toRows(event.endMin), '--span': event.bufferMin / step }"
              />
              <button
                type="button"
                :class="['ui-timegrid__event', `ui-timegrid__event--${event.tone ?? 'default'}`]"
                :aria-label="event.label"
                :style="{
                  '--top': toRows(event.startMin),
                  '--span': (event.endMin - event.startMin) / step,
                }"
                @click="emit('select-event', event.id)"
              >
                <slot name="event" :event="event">
                  <span class="ui-timegrid__event-title">{{ event.title }}</span>
                  {{ ' ' }}
                  <span v-if="event.subtitle" class="ui-timegrid__event-sub">{{
                    event.subtitle
                  }}</span>
                </slot>
              </button>
            </template>
          </div>
          <div
            v-if="showNow"
            class="ui-timegrid__now"
            role="separator"
            :aria-label="$t('ui.timeGrid.now')"
            :style="{ '--top': toRows(now as number) }"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ui-timegrid {
  --gutter: 3.5rem;
  --row-h: 1.75rem;

  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-md);
  background: var(--color-surface);
}

.ui-timegrid__scroll {
  overflow-x: auto;
}

.ui-timegrid__scroll:focus-visible {
  outline: var(--focus-ring-width) solid var(--color-focus-ring);
  outline-offset: calc(var(--focus-ring-width) * -1);
}

.ui-timegrid__inner {
  min-inline-size: calc(var(--gutter) + var(--cols) * 8rem);
}

.ui-timegrid__head,
.ui-timegrid__body {
  display: grid;
  grid-template-columns: var(--gutter) repeat(var(--cols), minmax(0, 1fr));
}

.ui-timegrid__head {
  border-block-end: 1px solid var(--color-border-strong);
}

.ui-timegrid__title {
  padding: var(--space-2);
  font-weight: 600;
  text-align: center;
}

.ui-timegrid__body {
  position: relative;
}

.ui-timegrid__gutter {
  position: relative;
  block-size: calc(var(--rows) * var(--row-h));
}

.ui-timegrid__hour {
  position: absolute;
  inset-block-start: calc(var(--top) * var(--row-h));
  inset-inline-end: var(--space-2);
  transform: translateY(-50%);
  color: var(--color-text-muted);
  font-size: var(--text-xs);
  font-variant-numeric: tabular-nums;
}

.ui-timegrid__track {
  position: relative;
  block-size: calc(var(--rows) * var(--row-h));
  border-inline-start: 1px solid var(--color-border);
  background-image: repeating-linear-gradient(
    to bottom,
    transparent 0,
    transparent calc(var(--row-h) - 1px),
    var(--color-border) calc(var(--row-h) - 1px),
    var(--color-border) var(--row-h)
  );
  cursor: pointer;
}

.ui-timegrid__off,
.ui-timegrid__buffer,
.ui-timegrid__event {
  position: absolute;
  inset-inline: 2px;
  inset-block-start: calc(var(--top) * var(--row-h));
  block-size: calc(var(--span) * var(--row-h));
}

.ui-timegrid__off {
  pointer-events: none;
  background: repeating-linear-gradient(
    135deg,
    var(--color-surface-muted) 0,
    var(--color-surface-muted) 6px,
    var(--color-border) 6px,
    var(--color-border) 7px
  );
  inset-inline: 0;
}

.ui-timegrid__buffer {
  pointer-events: none;
  border-radius: 0 0 var(--radius-sm) var(--radius-sm);
  background: var(--color-surface-muted);
  opacity: 0.7;
}

.ui-timegrid__event {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  overflow: hidden;
  padding: var(--space-1) var(--space-2);
  border: 0;
  border-inline-start: 3px solid var(--color-accent);
  border-radius: var(--radius-sm);
  background: var(--color-accent-subtle);
  color: var(--color-text);
  font: inherit;
  font-size: var(--text-sm);
  text-align: start;
  cursor: pointer;
}

.ui-timegrid__event--success {
  border-inline-start-color: var(--color-success);
  background: var(--color-success-subtle);
}

.ui-timegrid__event--warning {
  border-inline-start-color: var(--color-warning);
  background: var(--color-warning-subtle);
}

.ui-timegrid__event--danger {
  border-inline-start-color: var(--color-danger);
  background: var(--color-danger-subtle);
}

.ui-timegrid__event--muted {
  border-inline-start-color: var(--color-text-muted);
  background: var(--color-surface-muted);
  color: var(--color-text-muted);
}

.ui-timegrid__event:focus-visible {
  outline: var(--focus-ring-width) solid var(--color-focus-ring);
  outline-offset: 1px;
}

.ui-timegrid__event-title {
  font-weight: 600;
}

.ui-timegrid__event-sub {
  color: var(--color-text-muted);
}

.ui-timegrid__now {
  position: absolute;
  inset-inline: var(--gutter) 0;
  inset-block-start: calc(var(--top) * var(--row-h));
  block-size: 2px;
  background: var(--color-danger);
  pointer-events: none;
}
</style>
