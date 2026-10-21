<script setup lang="ts">
import type { MessageKey } from '@app/i18n'
import { computed, ref, useAttrs } from 'vue'
import { useI18n } from 'vue-i18n'

import Icon from '../Icon/Icon.vue'
import type { IconName } from '../Icon/icons'
import IconButton from '../IconButton/IconButton.vue'

defineOptions({ inheritAttrs: false })

const props = withDefaults(
  defineProps<{
    modelValue?: string
    type?: 'text' | 'email' | 'tel' | 'password' | 'search' | 'date'
    placeholder?: MessageKey
    /** Обязателен: имя — `name`, телефон — `tel`, email — `email`, пароль — `current-password`/`new-password`. */
    autocomplete: string
    inputmode?: 'text' | 'tel' | 'email' | 'numeric' | 'search' | 'url' | 'decimal' | 'none'
    maxlength?: number
    min?: string
    max?: string
    name?: string
    readonly?: boolean
    disabled?: boolean
    invalid?: boolean
    prefixIcon?: IconName
    clearable?: boolean
  }>(),
  { modelValue: '', type: 'text' },
)

const emit = defineEmits<{
  'update:modelValue': [value: string]
  input: [event: Event]
  blur: [event: FocusEvent]
  focus: [event: FocusEvent]
}>()

const { t } = useI18n()
const attrs = useAttrs()
const inputEl = ref<HTMLInputElement | null>(null)

const rootAttrs = computed(() => ({ class: attrs.class, style: attrs.style }))
const inputAttrs = computed(() => {
  const { class: _class, style: _style, ...rest } = attrs
  return rest
})
const showClear = computed(
  () => props.clearable && props.modelValue !== '' && !props.disabled && !props.readonly,
)

function onInput(event: Event): void {
  emit('update:modelValue', (event.target as HTMLInputElement).value)
  emit('input', event)
}

function clear(): void {
  emit('update:modelValue', '')
  inputEl.value?.focus()
}

defineExpose({ focus: () => inputEl.value?.focus(), el: inputEl })
</script>

<template>
  <div
    :class="[
      'ui-input',
      {
        'ui-input--invalid': invalid,
        'ui-input--disabled': disabled,
        'ui-input--readonly': readonly,
        'ui-input--has-prefix': prefixIcon,
      },
    ]"
    v-bind="rootAttrs"
  >
    <Icon v-if="prefixIcon" :name="prefixIcon" class="ui-input__prefix" />
    <input
      ref="inputEl"
      class="ui-input__control"
      :type="type"
      :value="modelValue"
      :name="name"
      :placeholder="placeholder ? t(placeholder) : undefined"
      :autocomplete="autocomplete"
      :inputmode="inputmode"
      :maxlength="maxlength"
      :min="min"
      :max="max"
      :readonly="readonly"
      :disabled="disabled"
      :aria-invalid="invalid ? 'true' : undefined"
      v-bind="inputAttrs"
      @input="onInput"
      @blur="emit('blur', $event)"
      @focus="emit('focus', $event)"
    />
    <IconButton
      v-if="showClear"
      icon-only="x"
      ariaLabel="ui.search.clear"
      size="sm"
      class="ui-input__clear"
      @click="clear"
    />
    <slot name="suffix" />
  </div>
</template>

<style scoped>
.ui-input {
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--space-1);
  min-height: var(--control-height-md);
  padding-inline: var(--space-3);
  background: var(--color-surface);
  border: 1px solid var(--color-border-input);
  border-radius: var(--radius-md);
  color: var(--color-text);
  transition: border-color var(--duration-fast) var(--ease-standard);
}

.ui-input:hover:not(.ui-input--disabled, .ui-input--readonly) {
  border-color: var(--color-text-muted);
}

.ui-input:focus-within {
  border-color: var(--color-focus-ring);
  outline: var(--focus-ring-width) solid var(--color-focus-ring);
  outline-offset: 0;
}

.ui-input--invalid,
.ui-input--invalid:hover:not(.ui-input--disabled, .ui-input--readonly) {
  border-color: var(--color-danger);
}

.ui-input--disabled {
  opacity: 0.6;
  background: var(--color-surface-muted);
  cursor: not-allowed;
}

.ui-input--readonly {
  background: var(--color-surface-muted);
}

.ui-input__prefix {
  color: var(--color-text-muted);
}

.ui-input__control {
  flex: 1;
  min-width: 0;
  min-height: calc(var(--control-height-md) - 2px);
  padding: 0;
  border: 0;
  outline: 0;
  background: transparent;
  color: inherit;
  font: inherit;
}

.ui-input__control:disabled {
  cursor: not-allowed;
}

.ui-input__control::placeholder {
  color: var(--color-text-muted);
  opacity: 1;
}

.ui-input__control[type='search']::-webkit-search-cancel-button {
  display: none;
}
</style>
