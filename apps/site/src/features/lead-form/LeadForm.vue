<script setup lang="ts">
import type { MessageKey } from '@app/i18n'
import {
  Alert,
  Button,
  Checkbox,
  Field,
  Heading,
  Icon,
  Input,
  Link,
  PhoneInput,
  Select,
  Stack,
  Text,
  Textarea,
} from '@app/ui'
import type { SelectOption } from '@app/ui'
import { computed, nextTick, onMounted, ref, watch } from 'vue'

import siteConfig from '../../../site.config'
import { useLeadForm } from './useLeadForm'

const { form, status, submittedNumber, blocked, retryMinutes, startAnother } = useLeadForm()

// Признак готовности для e2e: форма гидратирована и принимает ввод.
const ready = ref(false)
onMounted(() => {
  ready.value = true
})
const minutes = siteConfig.leadForm.callbackMinutes

const FIELD_LABELS: Record<string, MessageKey> = {
  name: 'lead.form.name',
  phone: 'lead.form.phone',
  email: 'lead.form.email',
  serviceSlug: 'lead.form.service',
  message: 'lead.form.message',
  consent: 'lead.form.consentField',
}

const serviceOptions: SelectOption[] = siteConfig.services.map((s) => ({
  value: s.slug,
  label: s.title,
}))

const phoneHref = `tel:${siteConfig.contacts.phoneE164}`

const successHeading = ref<{ $el: HTMLElement } | null>(null)
watch(status, async (value) => {
  if (value !== 'success') return
  await nextTick()
  successHeading.value?.$el.focus()
})

const nameField = computed(() => form.field('name'))
const phoneField = computed(() => form.field('phone'))
const emailField = computed(() => form.field('email'))
const serviceField = computed(() => form.field('serviceSlug'))
const messageField = computed(() => form.field('message'))
const consentField = computed(() => form.field('consent'))
</script>

<template>
  <div v-if="status === 'success'" class="lead-success" role="status">
    <Icon name="check-circle" size="lg" class="lead-success__icon" />
    <Heading
      ref="successHeading"
      k="lead.form.successTitle"
      :args="{ number: submittedNumber }"
      :level="3"
      tabindex="-1"
    />
    <Text k="lead.form.successText" :args="{ minutes }" tone="muted" as="p" />
    <Button label="lead.form.another" variant="secondary" @click="startAnother" />
  </div>

  <form
    v-else
    class="lead-form"
    :data-ready="ready ? 'true' : undefined"
    novalidate
    aria-labelledby="lead-form-title"
    @submit="form.handleSubmit"
  >
    <Stack :gap="5">
      <Alert v-if="form.errorList.value.length > 0" tone="danger" title="lead.form.errorsLead">
        <ul class="lead-form__errors">
          <li v-for="item in form.errorList.value" :key="item.name">
            <Link
              :k="FIELD_LABELS[item.name] ?? 'lead.form.name'"
              :href="`#${item.name}`"
              @click.prevent="form.focusField(item.name)"
            />
            <Text :k="item.key" as="span" tone="danger" variant="body-sm" />
          </li>
        </ul>
      </Alert>

      <Alert
        v-if="status === 'rate-limited'"
        tone="warning"
        k="errors.api.rate_limited"
        :args="{ minutes: retryMinutes }"
      />

      <Alert v-if="status === 'network-error'" tone="danger" k="errors.api.network">
        <Button label="common.retry" variant="secondary" size="sm" @click="form.handleSubmit()" />
      </Alert>

      <Alert v-if="status === 'server-error'" tone="danger" k="errors.api.internal_error">
        <Link k="lead.form.callDirect" :href="phoneHref" />
      </Alert>

      <Field
        v-slot="{ id, describedBy, invalid }"
        label="lead.form.name"
        :error="nameField.error"
        required
      >
        <Input
          :id="id"
          :aria-describedby="describedBy"
          :invalid="invalid"
          :model-value="nameField.modelValue"
          :name="nameField.name"
          autocomplete="name"
          :readonly="form.isSubmitting.value"
          @update:model-value="nameField['onUpdate:modelValue']"
          @blur="nameField.onBlur"
        />
      </Field>

      <Field
        v-slot="{ id, describedBy, invalid }"
        label="lead.form.phone"
        :error="phoneField.error"
        required
      >
        <PhoneInput
          :id="id"
          :aria-describedby="describedBy"
          :invalid="invalid"
          :model-value="phoneField.modelValue"
          :name="phoneField.name"
          :readonly="form.isSubmitting.value"
          @update:model-value="phoneField['onUpdate:modelValue']"
          @blur="phoneField.onBlur"
        />
      </Field>

      <Field
        v-slot="{ id, describedBy, invalid }"
        label="lead.form.email"
        :error="emailField.error"
        optional-mark
      >
        <Input
          :id="id"
          :aria-describedby="describedBy"
          :invalid="invalid"
          :model-value="emailField.modelValue"
          :name="emailField.name"
          type="email"
          autocomplete="email"
          :readonly="form.isSubmitting.value"
          @update:model-value="emailField['onUpdate:modelValue']"
          @blur="emailField.onBlur"
        />
      </Field>

      <Field
        v-slot="{ id, describedBy, invalid }"
        label="lead.form.service"
        :error="serviceField.error"
        optional-mark
      >
        <Select
          :id="id"
          :aria-describedby="describedBy"
          :invalid="invalid"
          :model-value="serviceField.modelValue"
          :name="serviceField.name"
          :options="serviceOptions"
          placeholder="lead.form.serviceNone"
          :disabled="form.isSubmitting.value"
          @update:model-value="serviceField['onUpdate:modelValue']"
          @blur="serviceField.onBlur"
        />
      </Field>

      <Field
        v-slot="{ id, describedBy, invalid }"
        label="lead.form.message"
        :error="messageField.error"
        optional-mark
      >
        <Textarea
          :id="id"
          :aria-describedby="describedBy"
          :invalid="invalid"
          :model-value="messageField.modelValue"
          :name="messageField.name"
          :maxlength="2000"
          :readonly="form.isSubmitting.value"
          @update:model-value="messageField['onUpdate:modelValue']"
          @blur="messageField.onBlur"
        />
      </Field>

      <!-- honeypot: вне экрана, без фокуса и для скринридеров -->
      <div class="lead-form__honeypot" aria-hidden="true">
        <input
          v-model="form.values.website"
          type="text"
          name="website"
          tabindex="-1"
          autocomplete="off"
        />
      </div>

      <div class="lead-form__consent">
        <Checkbox
          :model-value="consentField.modelValue"
          :name="consentField.name"
          :invalid="consentField.invalid"
          :aria-describedby="consentField.error ? 'consent-error' : undefined"
          :disabled="form.isSubmitting.value"
          @update:model-value="consentField['onUpdate:modelValue']"
          @blur="consentField.onBlur"
        >
          <i18n-t keypath="lead.form.consent" tag="span">
            <template #policy><Link k="lead.form.policyLink" to="/privacy" /></template>
            <template #consent><Link k="lead.form.consentLink" to="/consent" /></template>
          </i18n-t>
        </Checkbox>
        <div v-if="consentField.error" id="consent-error" role="alert">
          <Text :k="consentField.error" variant="body-sm" tone="danger" as="span" />
        </div>
      </div>

      <Button
        label="lead.form.submit"
        type="submit"
        size="lg"
        block
        :loading="form.isSubmitting.value"
        :disabled="blocked"
      />
    </Stack>
  </form>
</template>

<style scoped>
.lead-form__errors {
  display: grid;
  gap: var(--space-1);
  margin: var(--space-2) 0 0;
  padding: 0;
  list-style: none;
}

.lead-form__errors li {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.lead-form__honeypot {
  position: absolute;
  inset-inline-start: -10000px;
  width: 1px;
  height: 1px;
  overflow: hidden;
}

.lead-form__consent {
  display: grid;
  gap: var(--space-2);
}

.lead-success {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-4);
}

.lead-success__icon {
  color: var(--color-success);
}

.lead-success :deep(h3:focus) {
  outline: none;
}
</style>
