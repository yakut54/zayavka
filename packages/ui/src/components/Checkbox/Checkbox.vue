<script setup lang="ts">
import { useSplitAttrs } from '../../composables/useSplitAttrs'

defineOptions({ inheritAttrs: false })

withDefaults(
  defineProps<{
    modelValue?: boolean
    name?: string
    disabled?: boolean
    invalid?: boolean
  }>(),
  { modelValue: false },
)

const emit = defineEmits<{ 'update:modelValue': [value: boolean]; blur: [event: FocusEvent] }>()

const { rootAttrs, innerAttrs: inputAttrs } = useSplitAttrs()
</script>

<template>
  <label
    :class="['ui-checkbox', { 'ui-checkbox--disabled': disabled, 'ui-checkbox--invalid': invalid }]"
    v-bind="rootAttrs"
  >
    <input
      class="ui-checkbox__input"
      type="checkbox"
      :checked="modelValue"
      :name="name"
      :disabled="disabled"
      :aria-invalid="invalid ? 'true' : undefined"
      v-bind="inputAttrs"
      @change="emit('update:modelValue', ($event.target as HTMLInputElement).checked)"
      @blur="emit('blur', $event)"
    />
    <span class="ui-checkbox__label"><slot /></span>
  </label>
</template>

<style scoped>
.ui-checkbox {
  display: inline-flex;
  align-items: flex-start;
  gap: var(--space-3);
  cursor: pointer;
}

.ui-checkbox--disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.ui-checkbox__input {
  flex: none;
  position: relative;
  width: 1.5rem;
  height: 1.5rem;
  margin: 0;
  appearance: none;
  background: var(--color-surface);
  border: 2px solid var(--color-border-input);
  border-radius: var(--radius-sm);
  cursor: inherit;
  transition:
    background-color var(--duration-fast) var(--ease-standard),
    border-color var(--duration-fast) var(--ease-standard);
}

.ui-checkbox__input:hover:not(:disabled) {
  border-color: var(--color-text-muted);
}

.ui-checkbox__input:checked {
  background: var(--color-accent);
  border-color: var(--color-accent);
}

.ui-checkbox__input:checked::after {
  content: '';
  position: absolute;
  inset-block-start: 1px;
  inset-inline-start: 6px;
  width: 6px;
  height: 12px;
  border: solid var(--color-text-inverse);
  border-width: 0 2px 2px 0;
  transform: rotate(45deg);
}

.ui-checkbox__input:focus-visible {
  outline: var(--focus-ring-width) solid var(--color-focus-ring);
  outline-offset: var(--focus-ring-offset);
}

.ui-checkbox--invalid .ui-checkbox__input:not(:checked) {
  border-color: var(--color-danger);
}

.ui-checkbox__label {
  min-width: 0;
  padding-block-start: 0.1rem;
  font-size: var(--text-md);
  line-height: var(--leading-normal);
}
</style>
