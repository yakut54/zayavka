<script setup lang="ts">
import type { MessageKey } from '@app/i18n'

import { nextTick } from 'vue'
import { useI18n } from 'vue-i18n'

import { useSplitAttrs } from '../../composables/useSplitAttrs'
import Icon from '../Icon/Icon.vue'

defineOptions({ inheritAttrs: false })

export interface SelectOption {
  value: string
  label: MessageKey
}

const props = withDefaults(
  defineProps<{
    modelValue?: string
    options: SelectOption[]
    /** Пустой пункт `value=""` — «ничего не выбрано». */
    placeholder?: MessageKey
    name?: string
    disabled?: boolean
    invalid?: boolean
  }>(),
  { modelValue: '' },
)

const emit = defineEmits<{ 'update:modelValue': [value: string]; blur: [event: FocusEvent] }>()

/**
 * Контролируемый элемент: если родитель не принял новое значение (например, ждёт подтверждения),
 * нативный select возвращается к текущему, а не остаётся показывать выбранное пользователем.
 */
function onChange(event: Event): void {
  const el = event.target as HTMLSelectElement
  emit('update:modelValue', el.value)
  void nextTick(() => {
    if (el.value !== props.modelValue) el.value = props.modelValue
  })
}

const { t } = useI18n()
const { rootAttrs, innerAttrs: selectAttrs } = useSplitAttrs()
</script>

<template>
  <div
    :class="['ui-select', { 'ui-select--invalid': invalid, 'ui-select--disabled': disabled }]"
    v-bind="rootAttrs"
  >
    <select
      class="ui-select__control"
      :value="modelValue"
      :name="name"
      :disabled="disabled"
      :aria-invalid="invalid ? 'true' : undefined"
      v-bind="selectAttrs"
      @change="onChange"
      @blur="emit('blur', $event)"
    >
      <option v-if="placeholder" value="">{{ t(placeholder) }}</option>
      <option
        v-for="option in options"
        :key="option.value"
        :value="option.value"
        :selected="option.value === modelValue"
      >
        {{ t(option.label) }}
      </option>
    </select>
    <Icon name="chevron-down" class="ui-select__chevron" />
  </div>
</template>

<style scoped>
.ui-select {
  position: relative;
  display: flex;
  align-items: center;
}

.ui-select__control {
  width: 100%;
  min-height: var(--control-height-md);
  padding: 0 var(--space-10) 0 var(--space-3);
  appearance: none;
  background: var(--color-surface);
  border: 1px solid var(--color-border-input);
  border-radius: var(--radius-md);
  color: var(--color-text);
  font: inherit;
  cursor: pointer;
  transition: border-color var(--duration-fast) var(--ease-standard);
}

.ui-select__control:hover:not(:disabled) {
  border-color: var(--color-text-muted);
}

.ui-select__control:focus {
  border-color: var(--color-focus-ring);
  outline: var(--focus-ring-width) solid var(--color-focus-ring);
  outline-offset: 0;
}

.ui-select--invalid .ui-select__control {
  border-color: var(--color-danger);
}

.ui-select__control:disabled {
  opacity: 0.6;
  background: var(--color-surface-muted);
  cursor: not-allowed;
}

.ui-select__chevron {
  position: absolute;
  inset-inline-end: var(--space-3);
  pointer-events: none;
  color: var(--color-text-muted);
}
</style>
