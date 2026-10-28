<script setup lang="ts">
import { Button, DateStrip, EmptyState, ErrorState, Skeleton, Stack } from '@app/ui'
import { computed, toRef, watch } from 'vue'
import { useRouter } from 'vue-router'

import { useMaxBridge } from '../bridge/useMaxBridge'
import StepLayout from '../features/booking/StepLayout.vue'
import { useDays } from '../features/booking/useDays'
import { useFlow } from '../features/booking/useFlow'
import { errorCode, useBootstrap } from '../features/launch/useBootstrap'
import { useBookingDraft } from '../stores/bookingDraft'

const bridge = useMaxBridge()
const bootstrap = useBootstrap()
const draft = useBookingDraft()
const flow = useFlow()
const router = useRouter()

if (!draft.serviceSlug || !draft.resource) void router.replace({ name: 'home' })

const { days, loading, error, hasMore, loadMore, reload } = useDays(
  toRef(draft, 'serviceSlug'),
  toRef(draft, 'resource'),
  computed(() => bootstrap.value.settings.horizon_days),
  computed(() => bootstrap.value.business.timezone),
)

const firstAvailable = computed(() => days.value.find((day) => day.available)?.date)
const noneAvailable = computed(
  () => !loading.value && !hasMore.value && days.value.length > 0 && !firstAvailable.value,
)

// Ближайший доступный день выбран по умолчанию.
watch(firstAvailable, (date) => {
  const current = days.value.some((day) => day.date === draft.date && day.available)
  if (date && !current) draft.setDate(date)
})

// Ближайших свободных дней нет в загруженной порции — подгружаем следующую.
watch([days, loading], () => {
  if (!loading.value && hasMore.value && !firstAvailable.value) void loadMore()
})

async function select(date: string): Promise<void> {
  draft.setDate(date)
  bridge.haptic.selection()
  await flow.next('date')
}

async function otherResource(): Promise<void> {
  if (draft.isReschedule) draft.changeResourceForReschedule()
  await router.push({ name: 'book-resource' })
}
</script>

<template>
  <StepLayout step="date" title="miniapp.steps.date">
    <ErrorState v-if="error" :code="errorCode(error)" @retry="reload()" />
    <Stack v-else-if="days.length === 0" :gap="3">
      <Skeleton height="4rem" />
    </Stack>
    <EmptyState
      v-else-if="noneAvailable"
      title="miniapp.date.emptyTitle"
      description="miniapp.date.emptyText"
    >
      <Stack :gap="2">
        <Button
          v-if="draft.isReschedule || flow.eligibleResources().length > 1"
          label="miniapp.date.otherResource"
          variant="secondary"
          @click="otherResource"
        />
        <Button
          v-if="!draft.isReschedule"
          label="miniapp.date.leaveRequest"
          variant="ghost"
          :to="{ name: 'request' }"
        />
      </Stack>
    </EmptyState>
    <DateStrip
      v-else
      :days="days"
      :model-value="draft.date ?? undefined"
      label="miniapp.date.label"
      @update:model-value="select"
      @reach-end="loadMore()"
    />
    <template v-if="draft.isReschedule && !noneAvailable" #footer>
      <Button
        label="miniapp.reschedule.anotherResource"
        variant="ghost"
        block
        @click="otherResource"
      />
    </template>
  </StepLayout>
</template>
