<script setup lang="ts">
import { nextTick, ref, useId } from 'vue'

export interface Slot {
  value: string
  label: string
}

export interface SlotGroup {
  label: string
  slots: Slot[]
}

const props = defineProps<{ groups: SlotGroup[]; modelValue?: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const uid = useId()
const root = ref<HTMLElement | null>(null)

/** Единственная точка входа по Tab: выбранное время, иначе первое. */
function tabbableValue(): string | undefined {
  const all = props.groups.flatMap((g) => g.slots)
  return all.find((s) => s.value === props.modelValue)?.value ?? all[0]?.value
}

async function onKeydown(event: KeyboardEvent, group: SlotGroup, index: number): Promise<void> {
  const delta =
    event.key === 'ArrowRight' || event.key === 'ArrowDown'
      ? 1
      : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
        ? -1
        : 0
  if (delta === 0) return
  const next = group.slots[(index + delta + group.slots.length) % group.slots.length]
  if (!next) return
  event.preventDefault()
  emit('update:modelValue', next.value)
  await nextTick()
  root.value?.querySelector<HTMLElement>(`[data-value="${CSS.escape(next.value)}"]`)?.focus()
}
</script>

<template>
  <div ref="root" class="ui-slot-grid">
    <section v-for="(group, groupIndex) in groups" :key="group.label" class="ui-slot-grid__group">
      <h3 :id="`${uid}-${groupIndex}`" class="ui-slot-grid__title">{{ group.label }}</h3>
      <div class="ui-slot-grid__slots" role="radiogroup" :aria-labelledby="`${uid}-${groupIndex}`">
        <button
          v-for="(slot, index) in group.slots"
          :key="slot.value"
          type="button"
          role="radio"
          class="ui-slot-grid__slot"
          :data-value="slot.value"
          :aria-checked="slot.value === modelValue"
          :tabindex="slot.value === tabbableValue() ? 0 : -1"
          @click="emit('update:modelValue', slot.value)"
          @keydown="onKeydown($event, group, index)"
        >
          {{ slot.label }}
        </button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.ui-slot-grid {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.ui-slot-grid__title {
  margin: 0 0 var(--space-2);
  color: var(--color-text-muted);
  font-size: var(--text-sm);
  font-weight: 600;
}

.ui-slot-grid__slots {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--space-2);
}

@media (max-width: 24rem) {
  .ui-slot-grid__slots {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

.ui-slot-grid__slot {
  min-block-size: var(--control-height-md);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  color: var(--color-text);
  font: inherit;
  font-variant-numeric: tabular-nums;
  cursor: pointer;
}

.ui-slot-grid__slot:hover {
  border-color: var(--color-text-muted);
}

.ui-slot-grid__slot[aria-checked='true'] {
  border-color: var(--color-accent);
  background: var(--color-accent);
  color: var(--color-text-inverse);
}

.ui-slot-grid__slot:focus-visible {
  outline: var(--focus-ring-width) solid var(--color-focus-ring);
  outline-offset: var(--focus-ring-offset);
}
</style>
