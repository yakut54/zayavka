<script setup lang="ts">
import {
  Badge,
  Button,
  DateTimeText,
  Dialog,
  EmptyState,
  ErrorState,
  Skeleton,
  Stack,
  Surface,
  Tabs,
  Text,
  useToast,
} from '@app/ui'
import type { MessageKey } from '@app/i18n'
import type { TabItem } from '@app/ui'
import { ApiError } from '@app/api-client'
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/vue-query'
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'

import { useMaxBridge } from '../../bridge/useMaxBridge'
import { formatDateTime } from '../../lib/time'
import { type BookingView, useBookingDraft } from '../../stores/bookingDraft'
import { cancelBooking, fetchBookings } from '../booking/api'
import { errorCode, errorMessage, useBootstrap } from '../launch/useBootstrap'

const bridge = useMaxBridge()
const bootstrap = useBootstrap()
const draft = useBookingDraft()
const router = useRouter()
const toast = useToast()
const queryClient = useQueryClient()

const scope = ref<'upcoming' | 'past'>('upcoming')
const tabs: TabItem[] = [
  { id: 'upcoming', label: 'miniapp.mine.upcoming' },
  { id: 'past', label: 'miniapp.mine.past' },
]
const tz = computed(() => bootstrap.value.business.timezone)

const query = useInfiniteQuery({
  queryKey: computed(() => ['bookings', scope.value]),
  queryFn: ({ pageParam }) => fetchBookings(scope.value, pageParam),
  initialPageParam: 1,
  getNextPageParam: (last, pages) => {
    const loaded = pages.reduce((sum, page) => sum + page.items.length, 0)
    return loaded < last.total && last.items.length > 0 ? last.page + 1 : undefined
  },
})

const items = computed(() => query.data.value?.pages.flatMap((page) => page.items) ?? [])

const TONE: Record<string, 'success' | 'neutral' | 'danger' | 'warning'> = {
  confirmed: 'success',
  completed: 'neutral',
  no_show: 'warning',
  cancelled_by_client: 'neutral',
  cancelled_by_business: 'danger',
  rescheduled: 'neutral',
}

const statusKey = (status: string) => `miniapp.status.${status}` as MessageKey

const cancelTarget = ref<BookingView | null>(null)
const dialogOpen = computed({
  get: () => cancelTarget.value !== null,
  set: (open) => {
    if (!open) cancelTarget.value = null
  },
})
const cancelText = computed(() => ({
  when: cancelTarget.value ? formatDateTime(cancelTarget.value.starts_at, tz.value) : '',
}))

const cancel = useMutation({
  mutationFn: (booking: BookingView) => cancelBooking(booking.id, booking.version),
  onSuccess: async () => {
    toast.success('miniapp.mine.cancelled')
    await queryClient.invalidateQueries({ queryKey: ['bookings'] })
  },
  onError: async (error) => {
    toast.error(errorMessage(errorCode(error)))
    if (error instanceof ApiError && error.status === 409) {
      await queryClient.invalidateQueries({ queryKey: ['bookings'] })
    }
  },
  onSettled: () => {
    cancelTarget.value = null
  },
})

async function reschedule(booking: BookingView): Promise<void> {
  draft.startReschedule(booking)
  await router.push({ name: 'book-date' })
}

const call = (): void => bridge.openLink(`tel:${bootstrap.value.business.phone}`)
const book = (): Promise<unknown> => router.push({ name: 'home', query: { tab: 'book' } })
</script>

<template>
  <Stack :gap="4">
    <Tabs v-model="scope" :items="tabs" label="miniapp.mine.sublabel" />
    <Stack v-if="query.isPending.value" :gap="3">
      <Skeleton height="6rem" :lines="2" />
    </Stack>
    <ErrorState
      v-else-if="query.isError.value"
      :code="errorCode(query.error.value)"
      @retry="query.refetch()"
    />
    <EmptyState v-else-if="items.length === 0" title="miniapp.mine.emptyTitle">
      <Button label="miniapp.mine.emptyAction" @click="book" />
    </EmptyState>
    <template v-else>
      <Surface v-for="booking in items" :key="booking.id" :padding="4" as="article">
        <Stack :gap="2" as="div">
          <DateTimeText :value="booking.starts_at" :tz="tz" class="booking__when" />
          <p class="booking__line">{{ booking.service.title }}</p>
          <p class="booking__line">{{ booking.resource.name }}</p>
          <div class="booking__meta">
            <Badge :k="statusKey(booking.status)" :tone="TONE[booking.status] ?? 'neutral'" />
            <Text k="miniapp.mine.number" :args="{ number: booking.public_number }" tone="muted" />
          </div>
          <div v-if="booking.can_change" class="booking__actions">
            <Button
              label="miniapp.mine.reschedule"
              variant="secondary"
              size="sm"
              @click="reschedule(booking)"
            />
            <Button
              label="miniapp.mine.cancel"
              variant="ghost"
              size="sm"
              class="booking__danger"
              @click="cancelTarget = booking"
            />
          </div>
          <template v-else-if="booking.status === 'confirmed' && scope === 'upcoming'">
            <Text k="miniapp.mine.callToChange" tone="muted" as="p" />
            <Button label="miniapp.mine.call" variant="secondary" size="sm" @click="call" />
          </template>
        </Stack>
      </Surface>
      <Button
        v-if="query.hasNextPage.value"
        label="miniapp.mine.more"
        variant="secondary"
        :loading="query.isFetchingNextPage.value"
        @click="query.fetchNextPage()"
      />
    </template>
  </Stack>
  <Dialog
    v-model:open="dialogOpen"
    title="miniapp.mine.cancelTitle"
    :title-args="cancelText"
    confirm-label="miniapp.mine.cancelConfirm"
    cancel-label="miniapp.mine.cancelKeep"
    tone="danger"
    :loading="cancel.isPending.value"
    @confirm="cancelTarget && cancel.mutate(cancelTarget)"
  />
</template>

<style scoped>
.booking__when {
  font-size: var(--font-size-lg);
  font-weight: 600;
}

.booking__line {
  margin: 0;
}

.booking__meta,
.booking__actions {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.booking__danger {
  color: var(--color-danger);
}
</style>
