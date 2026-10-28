<script setup lang="ts">
import { ApiError } from '@app/api-client'
import { T } from '@app/i18n'
import {
  Alert,
  Button,
  Drawer,
  Field,
  Input,
  PhoneInput,
  Select,
  Stack,
  Text,
  Textarea,
  useForm,
  useToast,
} from '@app/ui'
import type { SelectOption } from '@app/ui'
import { computed, watch } from 'vue'
import { z } from 'zod'

import { adminConfig } from '../../../admin.config'
import { dateOf, formatRange, todayIn } from '../../lib/zoned'
import { useAdminSlots, useCreateBooking, useResourcesQuery } from './queries'

const props = defineProps<{
  open: boolean
  /** Предзаполнение при клике по свободной ячейке календаря. */
  initial?: { resourceId?: string; startsAt?: string } | null
}>()
const emit = defineEmits<{ close: [] }>()

const tz = adminConfig.timezone
const toast = useToast()
const resources = useResourcesQuery()
const create = useCreateBooking()

const schema = z.object({
  serviceSlug: z.string().min(1, 'required'),
  resource: z.string().min(1, 'required'),
  date: z.string().min(1, 'required'),
  slot: z.string().min(1, 'required'),
  name: z.string().trim().min(1, 'required').min(2, 'too_short').max(100, 'too_long'),
  phone: z
    .string()
    .min(1, 'required')
    .regex(/^7\d{10}$/, 'phone_invalid'),
  comment: z.string().max(500, 'too_long'),
})

const services = Object.entries(adminConfig.services)
const serviceOptions: SelectOption[] = services.map(([slug, key]) => ({
  value: slug,
  text: T(key),
}))

const form = useForm({
  schema,
  initial: {
    serviceSlug: services[0]?.[0] ?? '',
    resource: 'any',
    date: todayIn(tz),
    slot: '',
    name: '',
    phone: '',
    comment: '',
  },
  onSubmit: async (values) => {
    await create.mutateAsync({
      service_slug: values.serviceSlug,
      resource_id: values.resource === 'any' ? null : values.resource,
      starts_at: values.slot,
      name: values.name.trim(),
      phone: `+${values.phone}`,
      comment: values.comment.trim() || null,
      notify_client: false,
    })
    toast.success('admin.bookings.manual.created')
    emit('close')
  },
  onError: (error) => {
    if (error instanceof ApiError && error.status === 409) {
      toast.error(
        error.code === 'slot_taken' ? 'errors.api.slot_taken' : 'admin.bookings.drawer.notActive',
      )
      form.values.slot = ''
      void slots.refetch()
    } else if (error instanceof ApiError && error.status === 422) {
      const unmatched = form.setServerErrors(error.errors)
      if (unmatched.length > 0) toast.error('errors.api.validation_error')
    } else {
      toast.error('errors.api.internal_error')
    }
  },
})

const eligibleResources = computed(() =>
  (resources.data.value ?? []).filter(
    (r) => r.is_active && r.service_slugs.includes(String(form.values.serviceSlug)),
  ),
)
const resourceOptions = computed<SelectOption[]>(() => [
  { value: 'any', text: T('admin.bookings.manual.resourceAny') },
  ...eligibleResources.value.map((r) => ({ value: r.id, text: r.name })),
])

const slotParams = computed(() =>
  props.open && form.values.serviceSlug && form.values.date
    ? {
        service: String(form.values.serviceSlug),
        resource: String(form.values.resource || 'any'),
        date: String(form.values.date),
      }
    : null,
)
const slots = useAdminSlots(slotParams)
const slotOptions = computed<SelectOption[]>(() =>
  (slots.data.value?.slots ?? []).map((slot) => ({
    value: slot.starts_at,
    text: formatRange(slot.starts_at, slot.ends_at, tz),
  })),
)

// Смена услуги, сотрудника или даты сбрасывает выбранное время; сотрудник должен оказывать услугу.
watch(
  () => form.values.serviceSlug,
  () => {
    const known = eligibleResources.value.some((r) => r.id === form.values.resource)
    if (form.values.resource !== 'any' && !known) form.values.resource = 'any'
    form.values.slot = ''
  },
)
watch([() => form.values.resource, () => form.values.date], () => (form.values.slot = ''))

// Открытие: чистая форма; клик по ячейке подставляет сотрудника, дату и время.
watch(
  () => props.open,
  (open) => {
    if (!open) return
    form.reset()
    const initial = props.initial
    if (initial?.resourceId) form.values.resource = initial.resourceId
    if (initial?.startsAt) {
      form.values.date = dateOf(initial.startsAt, tz)
      form.values.slot = initial.startsAt
    }
  },
  { immediate: true },
)

const nameField = computed(() => form.field('name'))
const phoneField = computed(() => form.field('phone'))
const commentField = computed(() => form.field('comment'))
const slotField = computed(() => form.field('slot'))
const today = todayIn(tz)
</script>

<template>
  <Drawer
    :open="open"
    title="admin.bookings.manual.title"
    @update:open="(value) => !value && emit('close')"
  >
    <form novalidate @submit.prevent="form.handleSubmit">
      <Stack :gap="4">
        <Alert v-if="form.errorList.value.length > 0" tone="danger" k="lead.form.errorsLead" />
        <Field v-slot="{ id }" label="admin.bookings.manual.service" required>
          <Select
            :id="id"
            :model-value="String(form.values.serviceSlug)"
            :options="serviceOptions"
            @update:model-value="(v) => (form.values.serviceSlug = v)"
          />
        </Field>
        <Field v-slot="{ id }" label="admin.bookings.manual.resource" required>
          <Select
            :id="id"
            :model-value="String(form.values.resource)"
            :options="resourceOptions"
            @update:model-value="(v) => (form.values.resource = v)"
          />
        </Field>
        <Field v-slot="{ id }" label="admin.bookings.manual.date" required>
          <Input
            :id="id"
            :model-value="String(form.values.date)"
            type="date"
            autocomplete="off"
            :min="today"
            @update:model-value="(v) => (form.values.date = v)"
          />
        </Field>
        <Field
          v-slot="{ id, describedBy, invalid }"
          label="admin.bookings.manual.time"
          hint="admin.bookings.manual.timeHint"
          :error="slotField.error"
          required
        >
          <Select
            :id="id"
            :name="slotField.name"
            :model-value="slotField.modelValue"
            :options="slotOptions"
            placeholder="admin.bookings.drawer.moveTimePlaceholder"
            :aria-describedby="describedBy"
            :invalid="invalid"
            :disabled="slots.isPending.value"
            @update:model-value="slotField['onUpdate:modelValue']"
          />
        </Field>
        <Text
          v-if="slots.isSuccess.value && slotOptions.length === 0"
          k="admin.bookings.drawer.noSlots"
          tone="muted"
          as="p"
        />
        <Field
          v-slot="{ id, describedBy, invalid }"
          label="admin.bookings.manual.name"
          :error="nameField.error"
          required
        >
          <Input
            :id="id"
            :model-value="nameField.modelValue"
            :name="nameField.name"
            :aria-describedby="describedBy"
            :invalid="invalid"
            autocomplete="off"
            :maxlength="100"
            @update:model-value="nameField['onUpdate:modelValue']"
            @blur="nameField.onBlur"
          />
        </Field>
        <Field
          v-slot="{ id, describedBy, invalid }"
          label="admin.bookings.manual.phone"
          :error="phoneField.error"
          required
        >
          <PhoneInput
            :id="id"
            :model-value="phoneField.modelValue"
            :name="phoneField.name"
            :aria-describedby="describedBy"
            :invalid="invalid"
            @update:model-value="phoneField['onUpdate:modelValue']"
            @blur="phoneField.onBlur"
          />
        </Field>
        <Field
          v-slot="{ id, describedBy, invalid }"
          label="admin.bookings.manual.comment"
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
        <Button
          type="submit"
          label="admin.bookings.manual.submit"
          :loading="form.isSubmitting.value"
          block
        />
      </Stack>
    </form>
  </Drawer>
</template>
