<script setup lang="ts">
import type { MessageKey } from '@app/i18n'
import { computed, useId } from 'vue'

import Text from '../Text/Text.vue'
import VisuallyHidden from '../VisuallyHidden/VisuallyHidden.vue'

const props = defineProps<{
  label: MessageKey
  hint?: MessageKey
  /** Ключ сообщения об ошибке (`errors.field.<код>`); показывается только когда передан. */
  error?: MessageKey | undefined
  required?: boolean
  optionalMark?: boolean
}>()

const id = useId()
const hintId = `${id}-hint`
const errorId = `${id}-error`

const describedBy = computed(
  () =>
    [props.hint ? hintId : '', props.error ? errorId : ''].filter(Boolean).join(' ') || undefined,
)
const invalid = computed(() => props.error !== undefined)
</script>

<template>
  <div class="ui-field">
    <label :for="id" class="ui-field__label">
      <Text :k="label" variant="label" as="span" />
      <template v-if="required">
        <span class="ui-field__required" aria-hidden="true"> *</span>
        <VisuallyHidden> (<Text k="common.required" />)</VisuallyHidden>
      </template>
      <Text
        v-if="optionalMark"
        k="ui.field.optionalMark"
        variant="body-sm"
        tone="muted"
        as="span"
      />
    </label>
    <slot :id="id" :described-by="describedBy" :invalid="invalid" />
    <Text v-if="hint" :id="hintId" :k="hint" variant="body-sm" tone="muted" as="p" />
    <div v-if="error" :id="errorId" class="ui-field__error" role="alert">
      <Text :k="error" variant="body-sm" tone="danger" as="span" />
    </div>
  </div>
</template>

<style scoped>
.ui-field {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  min-width: 0;
}

.ui-field__label {
  display: block;
}

.ui-field__label > * + * {
  margin-inline-start: var(--space-1);
}

.ui-field__required {
  color: var(--color-danger);
}

.ui-field__error {
  display: flex;
}
</style>
