<script setup lang="ts">
import { ApiError } from '@app/api-client'
import {
  Alert,
  Button,
  Field,
  Heading,
  Icon,
  Input,
  PasswordInput,
  Stack,
  Surface,
  useForm,
} from '@app/ui'
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { z } from 'zod'

import { adminConfig } from '../../admin.config'
import { Text } from '@app/ui'
import { safeNext } from '../features/auth/safeNext'
import { useLogin } from '../features/auth/useAuth'

const route = useRoute()
const router = useRouter()
const login = useLogin()

const schema = z.object({
  email: z.string().trim().min(1, 'required'),
  password: z.string().min(1, 'required'),
})

type Failure = 'invalid' | 'rate-limited' | 'other' | null
const failure = ref<Failure>(null)
const retryMinutes = ref(1)

const form = useForm({
  schema,
  initial: { email: '', password: '' },
  onSubmit: async (values) => {
    failure.value = null
    try {
      await login.mutateAsync({ email: values.email, password: values.password })
      await router.replace(safeNext(route.query.next))
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) failure.value = 'invalid'
      else if (error instanceof ApiError && error.status === 429) {
        retryMinutes.value = Math.max(1, Math.ceil((error.retryAfter ?? 60) / 60))
        failure.value = 'rate-limited'
      } else failure.value = 'other'
    }
  },
})

const email = computed(() => form.field('email'))
const password = computed(() => form.field('password'))
</script>

<template>
  <div class="login">
    <Surface class="login__card" :padding="8" shadow="md">
      <Stack :gap="6">
        <Stack :gap="3" align="center">
          <span class="login__logo"><Icon name="list" size="lg" /></span>
          <Text :k="adminConfig.brandName" variant="h3" as="p" />
          <Heading k="admin.login.title" :level="1" align="center" />
        </Stack>

        <form novalidate @submit="form.handleSubmit">
          <Stack :gap="5">
            <Alert v-if="failure === 'invalid'" tone="danger" k="admin.login.invalid" />
            <Alert
              v-if="failure === 'rate-limited'"
              tone="warning"
              k="errors.api.rate_limited"
              :args="{ minutes: retryMinutes }"
            />
            <Alert v-if="failure === 'other'" tone="danger" k="errors.api.internal_error" />

            <Field
              v-slot="{ id, describedBy, invalid }"
              label="admin.login.email"
              :error="email.error"
              required
            >
              <Input
                :id="id"
                :aria-describedby="describedBy"
                :invalid="invalid"
                :model-value="email.modelValue"
                :name="email.name"
                type="email"
                autocomplete="username"
                @update:model-value="email['onUpdate:modelValue']"
                @blur="email.onBlur"
              />
            </Field>

            <Field
              v-slot="{ id, describedBy, invalid }"
              label="admin.login.password"
              :error="password.error"
              required
            >
              <PasswordInput
                :id="id"
                :aria-describedby="describedBy"
                :invalid="invalid"
                :model-value="password.modelValue"
                :name="password.name"
                autocomplete="current-password"
                @update:model-value="password['onUpdate:modelValue']"
                @blur="password.onBlur"
              />
            </Field>

            <Button
              label="admin.login.submit"
              type="submit"
              block
              :loading="form.isSubmitting.value"
            />
          </Stack>
        </form>
      </Stack>
    </Surface>
  </div>
</template>

<style scoped>
.login {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-4);
}

.login__card {
  width: min(26rem, 100%);
}

.login__logo {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 3rem;
  height: 3rem;
  border-radius: var(--radius-md);
  background: var(--color-accent);
  color: var(--color-text-inverse);
}
</style>
