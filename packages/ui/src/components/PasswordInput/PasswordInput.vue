<script setup lang="ts">
import type { MessageKey } from '@app/i18n'
import { computed, ref } from 'vue'

import IconButton from '../IconButton/IconButton.vue'
import Input from '../Input/Input.vue'

defineOptions({ inheritAttrs: false })

withDefaults(
  defineProps<{
    modelValue?: string
    placeholder?: MessageKey
    autocomplete: 'current-password' | 'new-password'
    name?: string
    maxlength?: number
    readonly?: boolean
    disabled?: boolean
    invalid?: boolean
  }>(),
  { modelValue: '' },
)

defineEmits<{ 'update:modelValue': [value: string]; blur: [event: FocusEvent] }>()

const visible = ref(false)
const type = computed(() => (visible.value ? 'text' : 'password'))
</script>

<template>
  <Input
    v-bind="{
      ...$attrs,
      modelValue,
      placeholder,
      autocomplete,
      name,
      maxlength,
      readonly,
      disabled,
      invalid,
    }"
    :type="type"
    @update:model-value="$emit('update:modelValue', $event)"
    @blur="$emit('blur', $event)"
  >
    <template #suffix>
      <IconButton
        :icon-only="visible ? 'eye-off' : 'eye'"
        :ariaLabel="visible ? 'common.hidePassword' : 'common.showPassword'"
        :aria-pressed="visible ? 'true' : 'false'"
        size="sm"
        :disabled="disabled"
        @click="visible = !visible"
      />
    </template>
  </Input>
</template>
