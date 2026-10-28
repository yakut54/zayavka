<script setup lang="ts">
import { Alert, Button, Dialog, Duration, Money, Stack, Surface, Text } from '@app/ui'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import { useMaxBridge } from '../bridge/useMaxBridge'
import StepLayout from '../features/booking/StepLayout.vue'
import { useSubmit } from '../features/booking/useSubmit'
import { useBootstrap } from '../features/launch/useBootstrap'
import { formatDateTime, formatRange, formatShortDateTime } from '../lib/time'
import { useBookingDraft } from '../stores/bookingDraft'

const { t } = useI18n()
const bridge = useMaxBridge()
const bootstrap = useBootstrap()
const draft = useBookingDraft()
const router = useRouter()
const { submit, submitting, alert } = useSubmit()

if (!draft.serviceSlug || !draft.resource || !draft.startsAt) void router.replace({ name: 'home' })

const tz = computed(() => bootstrap.value.business.timezone)
const service = computed(() => bootstrap.value.services.find((s) => s.slug === draft.serviceSlug))
const resourceName = computed(
  () =>
    bootstrap.value.resources.find((r) => r.id === draft.resource)?.name ??
    t('miniapp.confirm.anyResource'),
)
const endsAt = computed(() => {
  const start = draft.startsAt ? new Date(draft.startsAt) : null
  return start && service.value
    ? new Date(start.getTime() + service.value.duration_min * 60_000).toISOString()
    : null
})
const when = computed(() => (draft.startsAt ? formatDateTime(draft.startsAt, tz.value) : ''))
const range = computed(() =>
  draft.startsAt && endsAt.value ? formatRange(draft.startsAt, endsAt.value, tz.value) : '',
)
const deadline = computed(() => {
  if (!draft.startsAt) return ''
  const minutes = bootstrap.value.settings.cancel_deadline_min
  return formatDateTime(
    new Date(new Date(draft.startsAt).getTime() - minutes * 60_000).toISOString(),
    tz.value,
  )
})

const confirmOpen = ref(false)
const rescheduleText = computed(() => {
  const from = draft.rescheduling
  return {
    from: from ? formatShortDateTime(from.starts_at, tz.value) : '',
    to: draft.startsAt ? formatShortDateTime(draft.startsAt, tz.value) : '',
  }
})

function primary(): void {
  if (draft.isReschedule) confirmOpen.value = true
  else void submit()
}

async function confirmReschedule(): Promise<void> {
  await submit()
  confirmOpen.value = false
}

// Пока запись не создана — подтверждение закрытия (раздел 10.4 ТЗ).
onMounted(() => bridge.closingConfirmation(true))
onBeforeUnmount(() => bridge.closingConfirmation(false))

const rows = computed(() => {
  const list: { label: string; value: string; to: string }[] = [
    { label: t('miniapp.confirm.service'), value: service.value?.title ?? '', to: 'home' },
    { label: t('miniapp.confirm.resource'), value: resourceName.value, to: 'book-resource' },
    { label: t('miniapp.confirm.when'), value: `${when.value} (${range.value})`, to: 'book-date' },
  ]
  if (!draft.isReschedule) {
    list.push(
      { label: t('miniapp.confirm.name'), value: draft.name, to: 'book-contacts' },
      { label: t('miniapp.confirm.phone'), value: `+${draft.phone}`, to: 'book-contacts' },
    )
    if (draft.comment)
      list.push({ label: t('miniapp.confirm.comment'), value: draft.comment, to: 'book-contacts' })
  }
  return list
})
</script>

<template>
  <StepLayout step="confirm" title="miniapp.steps.confirm">
    <Surface :padding="4">
      <Stack :gap="3" as="div">
        <div v-for="row in rows" :key="row.label" class="row">
          <div class="row__body">
            <span class="row__label">{{ row.label }}</span>
            <span class="row__value">{{ row.value }}</span>
          </div>
          <Button label="miniapp.confirm.change" variant="link" size="sm" :to="{ name: row.to }" />
        </div>
        <div v-if="service" class="row__extra">
          <Duration :minutes="service.duration_min" />
          <Money v-if="service.price_from !== null" :amount="service.price_from" from />
        </div>
      </Stack>
    </Surface>
    <Text k="miniapp.confirm.rules" :args="{ deadline }" tone="muted" as="p" />
    <Alert v-if="alert" tone="danger" :k="alert.key" :args="alert.args" />
    <template #footer>
      <Button
        label="miniapp.confirm.submit"
        block
        :loading="submitting && !confirmOpen"
        @click="primary"
      />
    </template>
  </StepLayout>
  <Dialog
    v-model:open="confirmOpen"
    title="miniapp.reschedule.confirmTitle"
    description="miniapp.reschedule.confirmText"
    :description-args="rescheduleText"
    confirm-label="miniapp.reschedule.confirm"
    :loading="submitting"
    @confirm="confirmReschedule"
  />
</template>

<style scoped>
.row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-3);
}

.row__body {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.row__label {
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
}

.row__value {
  overflow-wrap: anywhere;
}

.row__extra {
  display: flex;
  gap: var(--space-3);
  color: var(--color-text-muted);
}
</style>
