<script setup lang="ts">
import { ApiError } from '@app/api-client'
import {
  Button,
  Dialog,
  Divider,
  Field,
  Heading,
  PasswordInput,
  Stack,
  Surface,
  Text,
  useForm,
  useToast,
} from '@app/ui'
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { z } from 'zod'

import { useChangePassword, useRevokeAll } from '../features/auth/useAuth'

const MIN_LENGTH = 12

const router = useRouter()
const toast = useToast()
const changePassword = useChangePassword()
const revokeAll = useRevokeAll()
const revokeOpen = ref(false)

const schema = z
  .object({
    currentPassword: z.string().min(1, 'required'),
    newPassword: z.string().min(1, 'required').min(MIN_LENGTH, 'too_short').max(256, 'too_long'),
    newPasswordConfirm: z.string().min(1, 'required'),
  })
  .refine((values) => values.newPassword === values.newPasswordConfirm, {
    message: 'password_mismatch',
    path: ['newPasswordConfirm'],
  })

const form = useForm({
  schema,
  initial: { currentPassword: '', newPassword: '', newPasswordConfirm: '' },
  onSubmit: async (values) => {
    try {
      await changePassword.mutateAsync({
        current_password: values.currentPassword,
        new_password: values.newPassword,
      })
      toast.success('admin.account.changed')
      form.reset()
    } catch (error) {
      if (error instanceof ApiError && error.status === 422) form.setServerErrors(error.errors)
      else toast.error('errors.api.internal_error')
    }
  },
})

const current = computed(() => form.field('currentPassword'))
const next = computed(() => form.field('newPassword'))
const confirm = computed(() => form.field('newPasswordConfirm'))
const length = computed(() => form.values.newPassword.length)

async function onRevokeAll(): Promise<void> {
  await revokeAll.mutateAsync().catch(() => undefined)
  revokeOpen.value = false
  await router.replace({ name: 'login' })
}
</script>

<template>
  <Stack :gap="6" class="account">
    <Heading k="admin.account.title" :level="1" />

    <Surface as="section" aria-labelledby="password-title">
      <form novalidate @submit="form.handleSubmit">
        <Stack :gap="5">
          <Heading id="password-title" k="admin.account.changePassword" :level="2" variant="h3" />

          <Field
            v-slot="{ id, describedBy, invalid }"
            label="admin.account.currentPassword"
            :error="current.error"
            required
          >
            <PasswordInput
              :id="id"
              :aria-describedby="describedBy"
              :invalid="invalid"
              :model-value="current.modelValue"
              :name="current.name"
              autocomplete="current-password"
              @update:model-value="current['onUpdate:modelValue']"
              @blur="current.onBlur"
            />
          </Field>

          <Field
            v-slot="{ id, describedBy, invalid }"
            label="admin.account.newPassword"
            :error="next.error"
            required
          >
            <PasswordInput
              :id="id"
              :aria-describedby="describedBy"
              :invalid="invalid"
              :model-value="next.modelValue"
              :name="next.name"
              autocomplete="new-password"
              @update:model-value="next['onUpdate:modelValue']"
              @blur="next.onBlur"
            />
          </Field>
          <Text
            k="admin.account.passwordLength"
            :args="{ count: length, min: MIN_LENGTH }"
            variant="body-sm"
            :tone="length >= MIN_LENGTH ? 'success' : 'muted'"
            as="p"
          />

          <Field
            v-slot="{ id, describedBy, invalid }"
            label="admin.account.newPasswordConfirm"
            :error="confirm.error"
            required
          >
            <PasswordInput
              :id="id"
              :aria-describedby="describedBy"
              :invalid="invalid"
              :model-value="confirm.modelValue"
              :name="confirm.name"
              autocomplete="new-password"
              @update:model-value="confirm['onUpdate:modelValue']"
              @blur="confirm.onBlur"
            />
          </Field>

          <div>
            <Button label="admin.account.submit" type="submit" :loading="form.isSubmitting.value" />
          </div>
        </Stack>
      </form>
    </Surface>

    <Surface as="section" aria-labelledby="security-title">
      <Stack :gap="4" align="start">
        <Heading id="security-title" k="admin.account.security" :level="2" variant="h3" />
        <Divider />
        <Button label="admin.account.revokeAll" variant="danger" @click="revokeOpen = true" />
      </Stack>
    </Surface>

    <Dialog
      v-model:open="revokeOpen"
      title="admin.account.revokeTitle"
      description="admin.account.revokeText"
      confirm-label="admin.account.revokeConfirm"
      tone="danger"
      :loading="revokeAll.isPending.value"
      @confirm="onRevokeAll"
    />
  </Stack>
</template>

<style scoped>
.account {
  max-width: 40rem;
}
</style>
