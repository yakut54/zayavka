<script setup lang="ts">
import { Button, Field, Input, PhoneInput, Stack, useToast } from '@app/ui'
import type { FieldBinding } from '@app/ui'
import { ref } from 'vue'

import { useMaxBridge } from '../../bridge/useMaxBridge'
import type { ContactProof } from '../../bridge/types'
import { normalizeContactPhone } from './contactSchema'

const props = defineProps<{
  name: FieldBinding<string>
  phone: FieldBinding<string>
  proof: ContactProof | null
  disabled?: boolean
}>()

const emit = defineEmits<{ 'update:proof': [value: ContactProof | null] }>()

const bridge = useMaxBridge()
const toast = useToast()
const requesting = ref(false)

async function share(): Promise<void> {
  requesting.value = true
  try {
    const result = await bridge.requestContact()
    if (!result) {
      toast.error('miniapp.contacts.contactFailed')
      return
    }
    props.phone['onUpdate:modelValue'](normalizeContactPhone(result.phone))
    emit('update:proof', result)
  } finally {
    requesting.value = false
  }
}

function change(): void {
  emit('update:proof', null)
}
</script>

<template>
  <Stack :gap="4">
    <Field
      v-slot="{ id, describedBy, invalid }"
      label="miniapp.contacts.name"
      :error="name.error"
      required
    >
      <Input
        :id="id"
        :model-value="name.modelValue"
        :name="name.name"
        :aria-describedby="describedBy"
        :invalid="invalid"
        :disabled="disabled"
        autocomplete="name"
        :maxlength="100"
        @update:model-value="name['onUpdate:modelValue']"
        @blur="name.onBlur"
      />
    </Field>
    <Field
      v-slot="{ id, describedBy, invalid }"
      label="miniapp.contacts.phone"
      :error="phone.error"
      required
    >
      <PhoneInput
        :id="id"
        :model-value="phone.modelValue"
        :name="phone.name"
        :aria-describedby="describedBy"
        :invalid="invalid"
        :readonly="proof !== null"
        :disabled="disabled"
        @update:model-value="phone['onUpdate:modelValue']"
        @blur="phone.onBlur"
      />
    </Field>
    <Button
      v-if="proof === null"
      label="miniapp.contacts.shareContact"
      variant="secondary"
      :loading="requesting"
      :disabled="disabled"
      @click="share"
    />
    <Button
      v-else
      label="miniapp.contacts.changePhone"
      variant="ghost"
      :disabled="disabled"
      @click="change"
    />
  </Stack>
</template>
