<script setup lang="ts">
import { Button, Dialog, Inline, Stack, Text } from '@app/ui'

import { formatDateTime } from '../../format'
import type { ConflictBooking } from './queries'

defineProps<{ open: boolean; bookings: ConflictBooking[]; loading?: boolean }>()
const emit = defineEmits<{
  'update:open': [value: boolean]
  'cancel-all': []
  keep: []
}>()
</script>

<template>
  <Dialog
    :open="open"
    title="admin.resources.conflict.title"
    description="admin.resources.conflict.text"
    confirm-label="admin.resources.conflict.cancelAll"
    cancel-label="admin.resources.conflict.abort"
    tone="danger"
    :loading="loading"
    @update:open="(value) => emit('update:open', value)"
    @confirm="emit('cancel-all')"
  >
    <Stack :gap="3">
      <ul class="conflicts">
        <li v-for="booking in bookings" :key="booking.id">
          <Text
            k="admin.resources.conflict.item"
            :args="{
              number: booking.public_number,
              when: formatDateTime(booking.starts_at),
              client: booking.client_name,
              service: booking.service_title,
            }"
            as="span"
          />
        </li>
      </ul>
      <Inline>
        <Button
          label="admin.resources.conflict.keep"
          variant="secondary"
          :disabled="loading"
          @click="emit('keep')"
        />
      </Inline>
    </Stack>
  </Dialog>
</template>

<style scoped>
.conflicts {
  max-height: 14rem;
  margin: 0;
  padding-inline-start: var(--space-5);
  overflow-y: auto;
}
</style>
