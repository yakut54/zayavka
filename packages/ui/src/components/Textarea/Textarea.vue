<script setup lang="ts">
import type { MessageKey } from '@app/i18n'
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { useSplitAttrs } from '../../composables/useSplitAttrs'
import Text from '../Text/Text.vue'

defineOptions({ inheritAttrs: false })

const props = withDefaults(
  defineProps<{
    modelValue?: string
    rows?: number
    maxRows?: number
    maxlength?: number
    autoresize?: boolean
    placeholder?: MessageKey
    name?: string
    readonly?: boolean
    disabled?: boolean
    invalid?: boolean
  }>(),
  { modelValue: '', rows: 4, maxRows: 10 },
)

const emit = defineEmits<{
  'update:modelValue': [value: string]
  blur: [event: FocusEvent]
  submit: []
}>()

const { t } = useI18n()
const el = ref<HTMLTextAreaElement | null>(null)

const { rootAttrs, innerAttrs: textareaAttrs } = useSplitAttrs()
const length = computed(() => props.modelValue.length)
const nearLimit = computed(
  () => props.maxlength !== undefined && length.value >= props.maxlength * 0.9,
)

function resize(): void {
  const node = el.value
  if (!props.autoresize || !node) return
  node.style.height = 'auto'
  node.style.height = `${node.scrollHeight}px`
}

function onInput(event: Event): void {
  emit('update:modelValue', (event.target as HTMLTextAreaElement).value)
  resize()
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
    event.preventDefault()
    emit('submit')
  }
}

onMounted(() => {
  // CSSOM, а не style-атрибут: строгий CSP (style-src 'self') запрещает инлайновые стили в HTML
  el.value?.style.setProperty('--ui-rows', String(props.maxRows))
  resize()
})
watch(
  () => props.modelValue,
  () => nextTick(resize),
)

defineExpose({ focus: () => el.value?.focus() })
</script>

<template>
  <div
    :class="['ui-textarea', { 'ui-textarea--invalid': invalid, 'ui-textarea--disabled': disabled }]"
    v-bind="rootAttrs"
  >
    <textarea
      ref="el"
      :class="['ui-textarea__control', { 'ui-textarea__control--auto': autoresize }]"
      :value="modelValue"
      :rows="rows"
      :name="name"
      :maxlength="maxlength"
      :placeholder="placeholder ? t(placeholder) : undefined"
      :readonly="readonly"
      :disabled="disabled"
      :aria-invalid="invalid ? 'true' : undefined"
      v-bind="textareaAttrs"
      @input="onInput"
      @keydown="onKeydown"
      @blur="emit('blur', $event)"
    />
    <Text
      v-if="maxlength !== undefined"
      k="ui.textarea.counter"
      :args="{ count: length, max: maxlength }"
      variant="caption"
      :tone="nearLimit ? 'warning' : 'muted'"
      as="span"
      class="ui-textarea__counter"
    />
  </div>
</template>

<style scoped>
.ui-textarea {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.ui-textarea__control {
  width: 100%;
  min-height: calc(var(--control-height-md) * 2);
  padding: var(--space-3);
  background: var(--color-surface);
  border: 1px solid var(--color-border-input);
  border-radius: var(--radius-md);
  color: var(--color-text);
  font: inherit;
  line-height: var(--leading-normal);
  resize: vertical;
  transition: border-color var(--duration-fast) var(--ease-standard);
}

.ui-textarea__control--auto {
  resize: none;
  overflow-y: auto;
  max-height: calc(1lh * var(--ui-rows) + var(--space-6));
}

.ui-textarea__control::placeholder {
  color: var(--color-text-muted);
  opacity: 1;
}

.ui-textarea__control:hover:not(:disabled, :read-only) {
  border-color: var(--color-text-muted);
}

.ui-textarea__control:focus {
  border-color: var(--color-focus-ring);
  outline: var(--focus-ring-width) solid var(--color-focus-ring);
  outline-offset: 0;
}

.ui-textarea--invalid .ui-textarea__control {
  border-color: var(--color-danger);
}

.ui-textarea__control:disabled {
  opacity: 0.6;
  background: var(--color-surface-muted);
  cursor: not-allowed;
}

.ui-textarea__control:read-only {
  background: var(--color-surface-muted);
}

.ui-textarea__counter {
  align-self: flex-end;
}
</style>
