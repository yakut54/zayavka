<script setup lang="ts">
import { toRef } from 'vue'

import { usePhoneMask } from '../../composables/usePhoneMask'
import Input from '../Input/Input.vue'

defineOptions({ inheritAttrs: false })

const props = withDefaults(
  defineProps<{
    /** Только цифры с кодом страны: `79991234567`. */
    modelValue?: string
    name?: string
    readonly?: boolean
    disabled?: boolean
    invalid?: boolean
  }>(),
  { modelValue: '' },
)

const emit = defineEmits<{ 'update:modelValue': [digits: string]; blur: [event: FocusEvent] }>()

const mask = usePhoneMask(toRef(props, 'modelValue'), (digits) => emit('update:modelValue', digits))
</script>

<template>
  <Input
    v-bind="{ ...$attrs, name, readonly, disabled, invalid }"
    type="tel"
    autocomplete="tel"
    inputmode="tel"
    placeholder="ui.phone.placeholder"
    :model-value="mask.display.value"
    @input="mask.onInput"
    @keydown="mask.onKeydown"
    @paste="mask.onPaste"
    @blur="emit('blur', $event)"
  />
</template>
