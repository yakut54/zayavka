<script setup lang="ts">
import type { MessageKey } from '@app/i18n'
import { onBeforeUnmount, ref, watch } from 'vue'

import { debounce } from '../../composables/useDebounce'
import Input from '../Input/Input.vue'

defineOptions({ inheritAttrs: false })

const props = withDefaults(
  defineProps<{
    modelValue?: string
    placeholder?: MessageKey
    debounceMs?: number
    name?: string
    disabled?: boolean
  }>(),
  { modelValue: '', debounceMs: 300 },
)

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const local = ref(props.modelValue)
const commit = debounce((value: string) => emit('update:modelValue', value), props.debounceMs)

watch(
  () => props.modelValue,
  (value) => {
    commit.cancel()
    local.value = value
  },
)

function onUpdate(value: string): void {
  local.value = value
  if (value === '') {
    commit.cancel()
    emit('update:modelValue', '')
  } else {
    commit(value)
  }
}

function onEnter(): void {
  commit.flush()
}

onBeforeUnmount(() => commit.cancel())
</script>

<template>
  <Input
    v-bind="$attrs"
    :model-value="local"
    type="search"
    autocomplete="off"
    inputmode="search"
    prefix-icon="search"
    :placeholder="placeholder"
    :name="name"
    :disabled="disabled"
    clearable
    @update:model-value="onUpdate"
    @keydown.enter.prevent="onEnter"
  />
</template>
