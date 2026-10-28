<script setup lang="ts">
import { useId } from 'vue'

defineProps<{
  modelValue?: string
  value: string
  title: string
  subtitle?: string
  meta?: string
  /** Общее имя группы: карточки с одним `name` образуют одну радиогруппу. */
  name?: string
  disabled?: boolean
}>()

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
const fallbackName = useId()
</script>

<template>
  <label :class="['ui-card-select', { 'ui-card-select--disabled': disabled }]">
    <input
      class="ui-card-select__input"
      type="radio"
      :name="name ?? fallbackName"
      :value="value"
      :checked="modelValue === value"
      :disabled="disabled"
      @change="emit('update:modelValue', value)"
    />
    <span class="ui-card-select__body">
      <span class="ui-card-select__title">{{ title }}</span>
      <span v-if="subtitle" class="ui-card-select__subtitle">{{ subtitle }}</span>
    </span>
    <span v-if="meta || $slots.meta" class="ui-card-select__meta">
      <slot name="meta">{{ meta }}</slot>
    </span>
  </label>
</template>

<style scoped>
.ui-card-select {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  min-height: var(--control-height-lg);
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  cursor: pointer;
  transition: border-color var(--duration-fast) var(--ease-standard);
}

.ui-card-select:hover:not(.ui-card-select--disabled) {
  border-color: var(--color-text-muted);
}

.ui-card-select:has(:checked) {
  border-color: var(--color-accent);
  background: var(--color-accent-subtle);
  box-shadow: inset 0 0 0 1px var(--color-accent);
}

.ui-card-select:has(:focus-visible) {
  outline: var(--focus-ring-width) solid var(--color-focus-ring);
  outline-offset: var(--focus-ring-offset);
}

.ui-card-select--disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.ui-card-select__input {
  position: absolute;
  inline-size: 1px;
  block-size: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

.ui-card-select__body {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  min-inline-size: 0;
}

.ui-card-select__title {
  font-weight: 600;
}

.ui-card-select__subtitle,
.ui-card-select__meta {
  color: var(--color-text-muted);
  font-size: var(--text-sm);
}

.ui-card-select__meta {
  flex-shrink: 0;
  text-align: end;
}
</style>
