<script setup lang="ts">
import { Button, Container, Heading, Icon, Stack, Surface, Text, useToast } from '@app/ui'
import { computed, nextTick, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import { api } from '../api'
import { useMaxBridge } from '../bridge/useMaxBridge'
import { useBootstrap } from '../features/launch/useBootstrap'
import { formatDateTime, formatRange } from '../lib/time'
import { useBookingDraft } from '../stores/bookingDraft'

const bridge = useMaxBridge()
const bootstrap = useBootstrap()
const draft = useBookingDraft()
const router = useRouter()
const toast = useToast()

const booking = computed(() => draft.completed)
if (!booking.value) void router.replace({ name: 'home' })

const tz = computed(() => bootstrap.value.business.timezone)
const heading = ref<{ $el: HTMLElement } | null>(null)
const canAddToCalendar = bridge.platform === 'ios' || bridge.platform === 'android'

// Фокус — на заголовок: скринридер сразу объявляет результат.
onMounted(async () => {
  await nextTick()
  heading.value?.$el.focus()
})

/** Файл запрашивается с initData (заголовок), поэтому в нативную загрузку уходит blob-ссылка. */
async function addToCalendar(): Promise<void> {
  const current = booking.value
  if (!current) return
  let saved: boolean
  try {
    const { data } = await api.GET('/api/v1/max/app/bookings/{booking_id}/calendar.ics', {
      params: { path: { booking_id: current.id } },
      parseAs: 'blob',
    })
    const url = URL.createObjectURL(data as Blob)
    saved = await bridge.downloadFile(url, `booking-${current.public_number}.ics`)
  } catch {
    saved = false
  }
  if (!saved) toast.error('miniapp.done.calendarFailed')
}

const mine = (): Promise<unknown> => router.push({ name: 'home', query: { tab: 'mine' } })
</script>

<template>
  <Container v-if="booking">
    <Stack :gap="4" class="done">
      <Icon name="check-circle" size="lg" class="done__icon" />
      <Heading ref="heading" k="miniapp.done.title" :level="1" tabindex="-1" />
      <Text k="miniapp.done.number" :args="{ number: booking.public_number }" tone="muted" as="p" />
      <Surface :padding="4">
        <Stack :gap="2" as="div">
          <Text :k="'miniapp.confirm.service'" variant="caption" tone="muted" as="p" />
          <p class="done__value">{{ booking.service.title }}</p>
          <p class="done__value">{{ booking.resource.name }}</p>
          <p class="done__value">
            {{ formatDateTime(booking.starts_at, tz) }} ({{
              formatRange(booking.starts_at, booking.ends_at, tz)
            }})
          </p>
        </Stack>
      </Surface>
      <Text k="miniapp.done.chatNotice" tone="muted" as="p" />
      <Button
        v-if="canAddToCalendar"
        label="miniapp.done.addToCalendar"
        variant="secondary"
        block
        @click="addToCalendar"
      />
      <Button label="miniapp.done.myBookings" variant="ghost" block @click="mine" />
    </Stack>
  </Container>
</template>

<style scoped>
.done {
  padding-block: var(--space-8) var(--space-4);
}

.done__icon {
  color: var(--color-success);
}

.done__value {
  margin: 0;
}
</style>
