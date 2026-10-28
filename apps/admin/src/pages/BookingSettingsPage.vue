<script setup lang="ts">
import { ApiError } from '@app/api-client'
import {
  Button,
  Checkbox,
  ErrorState,
  Field,
  Heading,
  Input,
  Select,
  Skeleton,
  Stack,
  Text,
  useToast,
} from '@app/ui'
import type { SelectOption } from '@app/ui'
import { computed, ref, watch } from 'vue'

import { useSettingsQuery } from '../features/bookings/queries'
import { useSaveSettings } from '../features/resources/queries'

const toast = useToast()
const settings = useSettingsQuery()
const save = useSaveSettings()

const STEPS = ['5', '10', '15', '20', '30', '60']
const stepOptions: SelectOption[] = STEPS.map((value) => ({
  value,
  text: `${value} мин`,
}))
const unitOptions: SelectOption[] = [
  { value: 'min', label: 'admin.settings.unitMinutes' },
  { value: 'hour', label: 'admin.settings.unitHours' },
]

/** Минуты ↔ «значение + единица»: целые часы показываются часами. */
function split(minutes: number): { value: string; unit: 'min' | 'hour' } {
  return minutes > 0 && minutes % 60 === 0
    ? { value: String(minutes / 60), unit: 'hour' }
    : { value: String(minutes), unit: 'min' }
}
const toMinutes = (value: string, unit: string): number =>
  Number.parseInt(value || '0', 10) * (unit === 'hour' ? 60 : 1)

const step = ref('15')
const earliest = ref({ value: '0', unit: 'min' as 'min' | 'hour' })
const horizon = ref('30')
const deadline = ref({ value: '0', unit: 'min' as 'min' | 'hour' })
const reminders = ref(true)
const attempted = ref(false)

watch(
  () => settings.data.value,
  (data) => {
    if (!data) return
    step.value = String(data.slot_step_min)
    earliest.value = split(data.min_lead_min)
    horizon.value = String(data.horizon_days)
    deadline.value = split(data.cancel_deadline_min)
    reminders.value = data.reminders_enabled
  },
  { immediate: true },
)

const MAX_MINUTES = 10_080
const leadMinutes = computed(() => toMinutes(earliest.value.value, earliest.value.unit))
const deadlineMinutes = computed(() => toMinutes(deadline.value.value, deadline.value.unit))
const horizonDays = computed(() => Number.parseInt(horizon.value || '0', 10))

const errors = computed(() => ({
  earliest: leadMinutes.value > MAX_MINUTES ? ('errors.field.too_long' as const) : undefined,
  deadline: deadlineMinutes.value > MAX_MINUTES ? ('errors.field.too_long' as const) : undefined,
  horizon:
    horizonDays.value < 1 || horizonDays.value > 90
      ? ('errors.field.invalid_format' as const)
      : undefined,
}))
const invalid = computed(() => Object.values(errors.value).some(Boolean))

async function submit(): Promise<void> {
  attempted.value = true
  const current = settings.data.value
  if (!current || invalid.value) return
  try {
    await save.mutateAsync({
      slot_step_min: Number(step.value) as 5 | 10 | 15 | 20 | 30 | 60,
      min_lead_min: leadMinutes.value,
      horizon_days: horizonDays.value,
      cancel_deadline_min: deadlineMinutes.value,
      reminders_enabled: reminders.value,
      version: current.version,
    })
    toast.success('admin.settings.saved')
  } catch (error) {
    if (error instanceof ApiError && error.status === 409) {
      toast.info('errors.api.version_conflict')
      await settings.refetch()
    } else toast.error('errors.api.internal_error')
  }
}
</script>

<template>
  <Stack :gap="5">
    <Heading k="admin.nav.bookingSettings" :level="1" />
    <ErrorState v-if="settings.isError.value" @retry="settings.refetch()" />
    <Skeleton v-else-if="settings.isPending.value" :lines="6" />
    <form v-else novalidate class="form" @submit.prevent="submit">
      <Stack :gap="5">
        <Field
          v-slot="{ id, describedBy }"
          label="admin.settings.step"
          hint="admin.settings.stepHint"
        >
          <Select :id="id" v-model="step" :aria-describedby="describedBy" :options="stepOptions" />
        </Field>

        <fieldset class="pair">
          <legend><Text k="admin.settings.lead" variant="label" as="span" /></legend>
          <Text k="admin.settings.leadHint" tone="muted" variant="body-sm" as="p" />
          <div class="pair__row">
            <Field
              v-slot="{ id, describedBy, invalid: bad }"
              label="admin.settings.value"
              :error="attempted ? errors.earliest : undefined"
            >
              <Input
                :id="id"
                v-model="earliest.value"
                name="lead"
                type="text"
                inputmode="numeric"
                autocomplete="off"
                :aria-describedby="describedBy"
                :invalid="bad"
              />
            </Field>
            <Field v-slot="{ id }" label="admin.settings.unit">
              <Select :id="id" v-model="earliest.unit" :options="unitOptions" />
            </Field>
          </div>
        </fieldset>

        <Field
          v-slot="{ id, describedBy, invalid: bad }"
          label="admin.settings.horizon"
          hint="admin.settings.horizonHint"
          :error="attempted ? errors.horizon : undefined"
        >
          <Input
            :id="id"
            v-model="horizon"
            name="horizon"
            type="text"
            inputmode="numeric"
            autocomplete="off"
            :aria-describedby="describedBy"
            :invalid="bad"
          />
        </Field>

        <fieldset class="pair">
          <legend><Text k="admin.settings.deadline" variant="label" as="span" /></legend>
          <Text k="admin.settings.deadlineHint" tone="muted" variant="body-sm" as="p" />
          <div class="pair__row">
            <Field
              v-slot="{ id, describedBy, invalid: bad }"
              label="admin.settings.value"
              :error="attempted ? errors.deadline : undefined"
            >
              <Input
                :id="id"
                v-model="deadline.value"
                name="deadline"
                type="text"
                inputmode="numeric"
                autocomplete="off"
                :aria-describedby="describedBy"
                :invalid="bad"
              />
            </Field>
            <Field v-slot="{ id }" label="admin.settings.unit">
              <Select :id="id" v-model="deadline.unit" :options="unitOptions" />
            </Field>
          </div>
        </fieldset>

        <div>
          <Checkbox v-model="reminders" name="reminders">
            <Text k="admin.settings.reminders" as="span" />
          </Checkbox>
          <Text k="admin.settings.remindersHint" tone="muted" variant="body-sm" as="p" />
        </div>

        <div>
          <Button type="submit" label="admin.settings.save" :loading="save.isPending.value" />
        </div>
      </Stack>
    </form>
  </Stack>
</template>

<style scoped>
.form {
  max-width: 36rem;
}

.pair {
  margin: 0;
  padding: 0;
  border: 0;
}

.pair legend {
  margin-block-end: var(--space-1);
  padding: 0;
}

.pair__row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-3);
  margin-block-start: var(--space-2);
}
</style>
