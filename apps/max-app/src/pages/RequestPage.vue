<script setup lang="ts">
import {
  Alert,
  Button,
  Checkbox,
  Container,
  Field,
  Heading,
  Icon,
  Link,
  Stack,
  Text,
  Textarea,
  useForm,
} from '@app/ui'
import type { MessageArgs, MessageKey } from '@app/i18n'
import { ApiError } from '@app/api-client'
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { useMaxBridge } from '../bridge/useMaxBridge'
import ContactFields from '../features/booking/ContactFields.vue'
import { createLead } from '../features/booking/api'
import { requestSchema } from '../features/booking/contactSchema'
import { errorCode, errorMessage, useBootstrap } from '../features/launch/useBootstrap'
import { useBookingDraft } from '../stores/bookingDraft'
import type { ContactProof } from '../bridge/types'

const { t } = useI18n()
const bridge = useMaxBridge()
const bootstrap = useBootstrap()
const draft = useBookingDraft()

const proof = ref<ContactProof | null>(null)
const number = ref<number | null>(null)
const alert = ref<{ key: MessageKey; args?: MessageArgs } | null>(null)
let openedAt = 0
onMounted(() => {
  openedAt = performance.now()
})

const serviceTitle = computed(
  () => bootstrap.value.services.find((s) => s.slug === draft.serviceSlug)?.title,
)

const form = useForm({
  schema: requestSchema,
  initial: {
    name: draft.name || bridge.userFirstName || bootstrap.value.user.first_name,
    phone: draft.phone,
    message: serviceTitle.value
      ? t('miniapp.request.defaultMessage', { service: serviceTitle.value })
      : '',
    consent: false,
  },
  onSubmit: async (values) => {
    alert.value = null
    number.value = await createLead({
      name: values.name.trim(),
      phone: `+${values.phone}`,
      message: values.message.trim() || null,
      service_slug: draft.serviceSlug,
      consent: true,
      policy_version: bootstrap.value.legal.policy_version,
      website: '',
      elapsed_ms: Math.max(0, Math.round(performance.now() - openedAt)),
    })
  },
  onError: (error) => {
    if (error instanceof ApiError && error.status === 422) {
      form.setServerErrors(error.errors)
    } else if (error instanceof ApiError && error.status === 429) {
      alert.value = {
        key: 'errors.api.rate_limited',
        args: { minutes: Math.max(1, Math.ceil((error.retryAfter ?? 60) / 60)) },
      }
    } else {
      alert.value = { key: errorMessage(errorCode(error)) }
    }
  },
})

const nameField = computed(() => form.field('name'))
const phoneField = computed(() => form.field('phone'))
const messageField = computed(() => form.field('message'))
const consentField = computed(() => form.field('consent'))
const openPrivacy = (): void => bridge.openLink(bootstrap.value.legal.privacy_url)
</script>

<template>
  <Container>
    <Stack v-if="number !== null" :gap="4" class="request" role="status">
      <Icon name="check-circle" size="lg" />
      <Heading k="miniapp.request.successTitle" :args="{ number }" :level="1" />
      <Text k="miniapp.request.successText" tone="muted" as="p" />
      <Button label="miniapp.request.toHome" :to="{ name: 'home' }" block />
    </Stack>
    <form v-else novalidate class="request" @submit.prevent="form.handleSubmit">
      <Stack :gap="4">
        <Heading k="miniapp.request.title" :level="1" />
        <Alert v-if="alert" tone="danger" :k="alert.key" :args="alert.args" />
        <ContactFields
          v-model:proof="proof"
          :name="nameField"
          :phone="phoneField"
          :disabled="form.isSubmitting.value"
        />
        <Field
          v-slot="{ id, describedBy, invalid }"
          label="miniapp.request.message"
          :error="messageField.error"
          optional-mark
        >
          <Textarea
            :id="id"
            :model-value="messageField.modelValue"
            :name="messageField.name"
            :aria-describedby="describedBy"
            :invalid="invalid"
            :rows="4"
            :maxlength="2000"
            @update:model-value="messageField['onUpdate:modelValue']"
            @blur="messageField.onBlur"
          />
        </Field>
        <div>
          <Checkbox
            :model-value="consentField.modelValue"
            :name="consentField.name"
            :invalid="consentField.invalid"
            @update:model-value="consentField['onUpdate:modelValue']"
            @blur="consentField.onBlur"
          >
            <i18n-t keypath="miniapp.contacts.consent" tag="span">
              <template #policy>
                <Link
                  k="miniapp.contacts.policyLink"
                  :href="bootstrap.legal.privacy_url"
                  external
                  @click.prevent="openPrivacy"
                />
              </template>
            </i18n-t>
          </Checkbox>
          <div v-if="consentField.error" role="alert">
            <Text :k="consentField.error" variant="body-sm" tone="danger" as="span" />
          </div>
        </div>
        <Button
          type="submit"
          label="miniapp.request.submit"
          :loading="form.isSubmitting.value"
          block
        />
      </Stack>
    </form>
  </Container>
</template>

<style scoped>
.request {
  padding-block: var(--space-6) var(--space-4);
}
</style>
