<script setup lang="ts">
import { Button, ListItem, EmptyState, ErrorState, Skeleton, SlotGrid, Stack, Text } from '@app/ui'
import { useQuery } from '@tanstack/vue-query'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import { useMaxBridge } from '../bridge/useMaxBridge'
import { fetchSlots } from '../features/booking/api'
import StepLayout from '../features/booking/StepLayout.vue'
import { useFlow } from '../features/booking/useFlow'
import { errorCode, useBootstrap } from '../features/launch/useBootstrap'
import { formatRange, groupSlots, timezoneNote } from '../lib/time'
import { useBookingDraft } from '../stores/bookingDraft'

const { t } = useI18n()
const bridge = useMaxBridge()
const bootstrap = useBootstrap()
const draft = useBookingDraft()
const flow = useFlow()
const router = useRouter()

if (!draft.serviceSlug || !draft.resource || !draft.date) void router.replace({ name: 'home' })

const tz = computed(() => bootstrap.value.business.timezone)

// Данные устаревают за 60 с (staleTime); при возврате на экран обновляются.
const query = useQuery({
  queryKey: computed(() => ['slots', draft.serviceSlug, draft.resource, draft.date]),
  queryFn: () =>
    fetchSlots(draft.serviceSlug as string, draft.resource as string, draft.date as string),
  enabled: computed(() => Boolean(draft.serviceSlug && draft.resource && draft.date)),
  staleTime: 60_000,
})

const slots = computed(() => query.data.value?.slots ?? [])
const groups = computed(() =>
  groupSlots(slots.value, tz.value, {
    morning: t('miniapp.time.morning'),
    day: t('miniapp.time.day'),
    evening: t('miniapp.time.evening'),
  }),
)
const selected = computed(() => slots.value.find((slot) => slot.starts_at === draft.startsAt))
const dateTitle = computed(() =>
  draft.date
    ? new Intl.DateTimeFormat('ru-RU', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        timeZone: 'UTC',
      }).format(new Date(`${draft.date}T00:00:00Z`))
    : '',
)
const note = computed(() => timezoneNote(tz.value))

function pick(value: string): void {
  draft.setSlot(value)
  bridge.haptic.selection()
}
</script>

<template>
  <StepLayout step="time" title="miniapp.steps.time">
    <ListItem
      v-if="draft.date"
      :title="dateTitle"
      interactive
      @click="router.push({ name: 'book-date' })"
    />
    <ErrorState
      v-if="query.isError.value"
      :code="errorCode(query.error.value)"
      @retry="query.refetch()"
    />
    <Stack v-else-if="query.isPending.value" :gap="3">
      <Skeleton height="3rem" :lines="3" />
    </Stack>
    <EmptyState
      v-else-if="groups.length === 0"
      title="miniapp.time.emptyTitle"
      description="miniapp.time.emptyText"
    >
      <Button label="miniapp.time.changeDate" variant="secondary" :to="{ name: 'book-date' }" />
    </EmptyState>
    <template v-else>
      <SlotGrid
        :groups="groups"
        :model-value="draft.startsAt ?? undefined"
        @update:model-value="pick"
      />
      <Text
        v-if="note"
        k="miniapp.time.timezone"
        :args="{ tz: note }"
        variant="caption"
        tone="muted"
        as="p"
      />
    </template>
    <template v-if="selected" #footer>
      <Button
        label="miniapp.time.next"
        :args="{ range: formatRange(selected.starts_at, selected.ends_at, tz) }"
        block
        @click="flow.next('time')"
      />
    </template>
  </StepLayout>
</template>
