<script setup lang="ts">
import { Alert, Button, Checkbox, Field, Link, Stack, Text, Textarea, useForm } from '@app/ui'
import { computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'

import { useMaxBridge } from '../bridge/useMaxBridge'
import ContactFields from '../features/booking/ContactFields.vue'
import { contactsSchema } from '../features/booking/contactSchema'
import StepLayout from '../features/booking/StepLayout.vue'
import { useFlow } from '../features/booking/useFlow'
import { useBootstrap } from '../features/launch/useBootstrap'
import { useBookingDraft } from '../stores/bookingDraft'

const bridge = useMaxBridge()
const bootstrap = useBootstrap()
const draft = useBookingDraft()
const flow = useFlow()
const router = useRouter()

if (!draft.serviceSlug || !draft.resource || !draft.startsAt) void router.replace({ name: 'home' })

const form = useForm({
  schema: contactsSchema,
  initial: {
    name: draft.name || bridge.userFirstName || bootstrap.value.user.first_name,
    phone: draft.phone,
    comment: draft.comment,
    // Чекбокс согласия не отмечен по умолчанию (ТЗ-1 §14).
    consent: false,
  },
  onSubmit: async (values) => {
    draft.name = values.name.trim()
    draft.phone = values.phone
    draft.comment = values.comment.trim()
    draft.consent = values.consent
    await flow.next('contacts')
  },
})

// Ошибки сервера (422 при подтверждении) раскладываются по полям этого шага.
onMounted(() => {
  if (draft.serverErrors.length > 0) {
    form.setServerErrors(draft.serverErrors)
    draft.serverErrors = []
    void form.handleSubmit()
  }
})

const proof = computed({
  get: () => draft.contactProof,
  set: (value) => {
    draft.contactProof = value
  },
})
const nameField = computed(() => form.field('name'))
const phoneField = computed(() => form.field('phone'))
const commentField = computed(() => form.field('comment'))
const consentField = computed(() => form.field('consent'))

const openPrivacy = (): void => bridge.openLink(bootstrap.value.legal.privacy_url)
</script>

<template>
  <StepLayout step="contacts" title="miniapp.steps.contacts">
    <form novalidate @submit.prevent="form.handleSubmit">
      <Stack :gap="4">
        <Alert v-if="form.errorList.value.length > 0" tone="danger" k="lead.form.errorsLead" />
        <ContactFields
          v-model:proof="proof"
          :name="nameField"
          :phone="phoneField"
          :disabled="form.isSubmitting.value"
        />
        <Field
          v-slot="{ id, describedBy, invalid }"
          label="miniapp.contacts.comment"
          :error="commentField.error"
          optional-mark
        >
          <Textarea
            :id="id"
            :model-value="commentField.modelValue"
            :name="commentField.name"
            :aria-describedby="describedBy"
            :invalid="invalid"
            :rows="3"
            :maxlength="500"
            @update:model-value="commentField['onUpdate:modelValue']"
            @blur="commentField.onBlur"
          />
        </Field>
        <div>
          <Checkbox
            :model-value="consentField.modelValue"
            :name="consentField.name"
            :invalid="consentField.invalid"
            :aria-describedby="consentField.error ? 'consent-error' : undefined"
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
          <div v-if="consentField.error" id="consent-error" role="alert">
            <Text :k="consentField.error" variant="body-sm" tone="danger" as="span" />
          </div>
        </div>
        <Button type="submit" label="miniapp.contacts.next" block />
      </Stack>
    </form>
  </StepLayout>
</template>
