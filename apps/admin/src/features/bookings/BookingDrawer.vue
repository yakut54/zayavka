<script setup lang="ts">
import { ApiError } from '@app/api-client'
import { T } from '@app/i18n'
import {
  Alert,
  Badge,
  Button,
  Checkbox,
  Dialog,
  Drawer,
  Duration,
  ErrorState,
  Field,
  Heading,
  IconButton,
  Inline,
  Input,
  Select,
  Skeleton,
  Stack,
  Text,
  Textarea,
  useToast,
} from '@app/ui'
import type { SelectOption } from '@app/ui'
import { computed, ref, watch } from 'vue'

import { adminConfig } from '../../../admin.config'
import { displayPhone, formatDateTime } from '../../format'
import { dateOf, durationMin, formatRange, todayIn } from '../../lib/zoned'
import { useCopyPhone } from '../leads/clipboard'
import {
  useAddBookingNote,
  useAdminSlots,
  useBookingQuery,
  useChangeBookingStatus,
  useRescheduleBooking,
  useResourcesQuery,
} from './queries'
import { BOOKING_TONE, bookingStatusLabel, isBookingStatus, sourceLabel } from './statuses'

const props = defineProps<{ id: string | undefined }>()
const emit = defineEmits<{ close: [] }>()

const tz = adminConfig.timezone
const toast = useToast()
const copyPhone = useCopyPhone()
const query = useBookingQuery(() => props.id)
const changeStatus = useChangeBookingStatus()
const reschedule = useRescheduleBooking()
const addNote = useAddBookingNote()
const resources = useResourcesQuery()

const open = computed(() => Boolean(props.id))
const detail = computed(() => query.data.value)
const booking = computed(() => detail.value?.booking)
const events = computed(() => [...(detail.value?.events ?? [])].reverse())
const errorCode = computed(() =>
  query.error.value instanceof ApiError ? query.error.value.code : 'internal_error',
)

const isConfirmed = computed(() => booking.value?.status === 'confirmed')
// «Пришёл» / «Не пришёл» доступны с момента начала записи.
const started = computed(() =>
  booking.value ? Date.parse(booking.value.starts_at) <= Date.now() : false,
)

function handleError(error: unknown): void {
  if (error instanceof ApiError && error.status === 409 && error.code === 'version_conflict') {
    toast.info('errors.api.version_conflict')
    void query.refetch()
  } else if (error instanceof ApiError && error.status === 409) {
    toast.error(
      error.code === 'slot_taken' ? 'errors.api.slot_taken' : 'admin.bookings.drawer.notActive',
    )
    void query.refetch()
  } else if (!(error instanceof ApiError && error.status === 401)) {
    toast.error('errors.api.internal_error')
  }
}

async function mark(status: 'completed' | 'no_show'): Promise<void> {
  const current = booking.value
  if (!current) return
  try {
    await changeStatus.mutateAsync({ id: current.id, status, version: current.version })
    toast.success('admin.bookings.drawer.statusChanged')
  } catch (error) {
    handleError(error)
  }
}

// ---------- отмена ----------
const cancelOpen = ref(false)
const cancelReason = ref('')
const cancelNotify = ref(true)
const cancelAttempted = ref(false)
const reasonError = computed(() =>
  cancelAttempted.value && cancelReason.value.trim() === '' ? 'errors.field.required' : undefined,
)

function openCancel(): void {
  cancelReason.value = ''
  cancelAttempted.value = false
  cancelNotify.value = booking.value?.has_max ?? false
  cancelOpen.value = true
}

async function confirmCancel(): Promise<void> {
  const current = booking.value
  cancelAttempted.value = true
  const reason = cancelReason.value.trim()
  if (!current || reason === '') return
  try {
    await changeStatus.mutateAsync({
      id: current.id,
      status: 'cancelled_by_business',
      version: current.version,
      cancelReason: reason,
      notifyClient: current.has_max && cancelNotify.value,
    })
    cancelOpen.value = false
    toast.success('admin.bookings.drawer.cancelled')
  } catch (error) {
    cancelOpen.value = false
    handleError(error)
  }
}

// ---------- перенос ----------
const moving = ref(false)
const moveDate = ref('')
const moveResource = ref('')
const moveSlot = ref('')
const moveNotify = ref(true)

function startMove(): void {
  const current = booking.value
  if (!current) return
  moveDate.value = dateOf(current.starts_at, tz)
  moveResource.value = current.resource.id
  moveSlot.value = ''
  moveNotify.value = current.has_max
  moving.value = true
}

const slotParams = computed(() => {
  const current = booking.value
  if (!moving.value || !current || !moveDate.value) return null
  return {
    service: current.service.slug,
    resource: moveResource.value || 'any',
    date: moveDate.value,
  }
})
const slotsQuery = useAdminSlots(slotParams)
const slotOptions = computed<SelectOption[]>(() =>
  (slotsQuery.data.value?.slots ?? []).map((slot) => ({
    value: slot.starts_at,
    text: formatRange(slot.starts_at, slot.ends_at, tz),
  })),
)
const resourceOptions = computed<SelectOption[]>(() => [
  { value: 'any', text: T('admin.bookings.manual.resourceAny') },
  ...(resources.data.value ?? [])
    .filter(
      (r) => r.is_active && booking.value && r.service_slugs.includes(booking.value.service.slug),
    )
    .map((r) => ({ value: r.id, text: r.name })),
])

watch([moveDate, moveResource], () => (moveSlot.value = ''))

async function confirmMove(): Promise<void> {
  const current = booking.value
  if (!current || !moveSlot.value) return
  try {
    await reschedule.mutateAsync({
      id: current.id,
      startsAt: moveSlot.value,
      resourceId: moveResource.value === 'any' ? null : moveResource.value,
      version: current.version,
      notifyClient: current.has_max && moveNotify.value,
    })
    moving.value = false
    toast.success('admin.bookings.drawer.rescheduled')
    emit('close')
  } catch (error) {
    handleError(error)
    void slotsQuery.refetch()
  }
}

// ---------- заметки ----------
const noteText = ref('')

async function submitNote(): Promise<void> {
  const text = noteText.value.trim()
  if (!text || !props.id || addNote.isPending.value) return
  try {
    await addNote.mutateAsync({ id: props.id, text })
    noteText.value = ''
    toast.success('admin.lead.noteAdded')
  } catch (error) {
    if (error instanceof ApiError && error.status === 422) toast.error('errors.field.too_long')
    else if (!(error instanceof ApiError && error.status === 401))
      toast.error('errors.api.internal_error')
  }
}

watch(
  () => props.id,
  () => {
    moving.value = false
    cancelOpen.value = false
    noteText.value = ''
  },
)

function statusArgs(payload: Record<string, unknown>) {
  const label = (value: unknown) =>
    isBookingStatus(value) ? T(bookingStatusLabel(value)) : String(value)
  return { from: label(payload.from), to: label(payload.to) }
}

const today = computed(() => todayIn(tz))
const isDemoOrMax = computed(() => booking.value?.has_max ?? false)
</script>

<template>
  <Drawer
    :open="open"
    :title="booking ? 'admin.bookings.drawer.title' : 'admin.bookings.title'"
    :title-args="{ number: booking?.public_number ?? 0 }"
    @update:open="(value) => !value && emit('close')"
  >
    <Stack v-if="query.isPending.value" :gap="4"><Skeleton :lines="6" /></Stack>
    <ErrorState v-else-if="query.isError.value" :code="errorCode" @retry="query.refetch()" />

    <Stack v-else-if="booking" :gap="6">
      <Inline :gap="3" wrap>
        <Badge :k="bookingStatusLabel(booking.status)" :tone="BOOKING_TONE[booking.status]" />
        <Badge
          :k="booking.is_demo ? 'admin.bookings.sources.demo' : sourceLabel(booking.source)"
          tone="muted"
        />
        <Text
          k="admin.bookings.drawer.created"
          :args="{ date: formatDateTime(booking.created_at) }"
          tone="muted"
          as="span"
        />
      </Inline>

      <Alert v-if="booking.anonymized_at" tone="info" k="admin.lead.anonymized" />

      <section aria-labelledby="booking-info-title">
        <Stack :gap="4">
          <Heading id="booking-info-title" k="admin.bookings.drawer.info" :level="3" variant="h3" />
          <dl class="facts">
            <div>
              <Text k="admin.bookings.drawer.when" as="dt" variant="label" tone="muted" />
              <dd class="facts__value">
                {{ formatDateTime(booking.starts_at) }}
                ({{ formatRange(booking.starts_at, booking.ends_at, tz) }})
              </dd>
            </div>
            <div>
              <Text k="admin.bookings.drawer.duration" as="dt" variant="label" tone="muted" />
              <dd class="facts__value">
                <Duration :minutes="durationMin(booking.starts_at, booking.ends_at)" />
              </dd>
            </div>
            <div>
              <Text k="admin.bookings.drawer.service" as="dt" variant="label" tone="muted" />
              <dd class="facts__value">{{ booking.service.title }}</dd>
            </div>
            <div>
              <Text k="admin.bookings.drawer.resource" as="dt" variant="label" tone="muted" />
              <dd class="facts__value">{{ booking.resource.name }}</dd>
            </div>
            <div v-if="booking.cancel_reason">
              <Text k="admin.bookings.drawer.cancelReason" as="dt" variant="label" tone="muted" />
              <dd class="facts__value">{{ booking.cancel_reason }}</dd>
            </div>
          </dl>
        </Stack>
      </section>

      <section aria-labelledby="booking-client-title">
        <Stack :gap="4">
          <Heading
            id="booking-client-title"
            k="admin.bookings.drawer.client"
            :level="3"
            variant="h3"
          />
          <dl class="facts">
            <div>
              <Text k="admin.lead.name" as="dt" variant="label" tone="muted" />
              <dd class="facts__value">{{ booking.client_name }}</dd>
            </div>
            <div>
              <Text k="admin.lead.phone" as="dt" variant="label" tone="muted" />
              <dd class="facts__value">
                <Inline :gap="2" wrap>
                  <span>{{ displayPhone(booking.client_phone_e164) }}</span>
                  <Button
                    label="admin.lead.call"
                    variant="secondary"
                    size="sm"
                    icon-start="phone"
                    :href="`tel:${booking.client_phone_e164}`"
                  />
                  <IconButton
                    icon-only="copy"
                    ariaLabel="admin.leads.copyPhone"
                    size="sm"
                    @click="copyPhone(booking.client_phone_e164)"
                  />
                </Inline>
                <Text
                  v-if="booking.phone_source === 'max_contact'"
                  k="admin.bookings.drawer.phoneVerified"
                  variant="caption"
                  tone="success"
                  as="p"
                />
              </dd>
            </div>
            <div v-if="booking.comment">
              <Text k="admin.bookings.drawer.comment" as="dt" variant="label" tone="muted" />
              <dd class="facts__value facts__message">{{ booking.comment }}</dd>
            </div>
          </dl>
        </Stack>
      </section>

      <section v-if="isConfirmed" aria-labelledby="booking-actions-title">
        <Stack :gap="3">
          <Heading
            id="booking-actions-title"
            k="admin.bookings.drawer.actions"
            :level="3"
            variant="h3"
          />
          <Inline :gap="2" wrap>
            <Button
              label="admin.bookings.drawer.arrived"
              variant="secondary"
              :disabled="!started || changeStatus.isPending.value"
              @click="mark('completed')"
            />
            <Button
              label="admin.bookings.drawer.noShow"
              variant="secondary"
              :disabled="!started || changeStatus.isPending.value"
              @click="mark('no_show')"
            />
            <Button
              label="admin.bookings.drawer.reschedule"
              variant="secondary"
              @click="startMove"
            />
            <Button label="admin.bookings.drawer.cancel" variant="danger" @click="openCancel" />
          </Inline>
          <Text
            v-if="!started"
            k="admin.bookings.drawer.arrivedHint"
            variant="caption"
            tone="muted"
            as="p"
          />

          <Stack v-if="moving" :gap="3" class="move">
            <Heading k="admin.bookings.drawer.moveTitle" :level="4" variant="h3" />
            <Field v-slot="{ id: fieldId }" label="admin.bookings.drawer.moveResource">
              <Select :id="fieldId" v-model="moveResource" :options="resourceOptions" />
            </Field>
            <Field v-slot="{ id: fieldId }" label="admin.bookings.drawer.moveDate">
              <Input :id="fieldId" v-model="moveDate" type="date" autocomplete="off" :min="today" />
            </Field>
            <Field v-slot="{ id: fieldId }" label="admin.bookings.drawer.moveTime">
              <Select
                :id="fieldId"
                v-model="moveSlot"
                :options="slotOptions"
                placeholder="admin.bookings.drawer.moveTimePlaceholder"
                :disabled="slotsQuery.isPending.value"
              />
            </Field>
            <Text
              v-if="slotsQuery.isSuccess.value && slotOptions.length === 0"
              k="admin.bookings.drawer.noSlots"
              tone="muted"
              as="p"
            />
            <Checkbox v-if="isDemoOrMax" v-model="moveNotify" name="notify">
              <Text k="admin.bookings.drawer.notify" as="span" />
            </Checkbox>
            <Inline :gap="2">
              <Button
                label="admin.bookings.drawer.moveConfirm"
                :disabled="!moveSlot"
                :loading="reschedule.isPending.value"
                @click="confirmMove"
              />
              <Button label="common.cancel" variant="ghost" @click="moving = false" />
            </Inline>
          </Stack>
        </Stack>
      </section>

      <section aria-labelledby="booking-notes-title">
        <Stack :gap="3">
          <Heading id="booking-notes-title" k="admin.lead.notes" :level="3" variant="h3" />
          <Field
            v-slot="{ id: fieldId, describedBy }"
            label="admin.lead.noteLabel"
            hint="admin.lead.noteHint"
          >
            <Textarea
              :id="fieldId"
              v-model="noteText"
              :aria-describedby="describedBy"
              :rows="3"
              :maxlength="2000"
              autoresize
              @submit="submitNote"
            />
          </Field>
          <div>
            <Button
              label="admin.lead.noteAdd"
              variant="secondary"
              :disabled="noteText.trim() === ''"
              :loading="addNote.isPending.value"
              @click="submitNote"
            />
          </div>
        </Stack>
      </section>

      <section aria-labelledby="booking-history-title">
        <Stack :gap="3">
          <Heading id="booking-history-title" k="admin.lead.history" :level="3" variant="h3" />
          <ol class="history">
            <li v-for="event in events" :key="event.id" class="history__event">
              <Text
                v-if="event.type === 'created'"
                k="admin.bookings.history.created"
                as="p"
                weight="medium"
              />
              <Text
                v-else-if="event.type === 'status_changed'"
                k="admin.lead.historyStatus"
                :args="statusArgs(event.payload)"
                as="p"
                weight="medium"
              />
              <Text
                v-else-if="event.type === 'cancelled'"
                k="admin.bookings.history.cancelled"
                :args="{
                  by: T(
                    event.payload.by === 'client'
                      ? 'admin.bookings.history.byClient'
                      : 'admin.bookings.history.byBusiness',
                  ),
                  reason: event.payload.reason ? String(event.payload.reason) : '—',
                }"
                as="p"
                weight="medium"
              />
              <Text
                v-else-if="event.type === 'rescheduled'"
                k="admin.bookings.history.rescheduled"
                as="p"
                weight="medium"
              />
              <p v-else class="history__note">{{ event.payload.text }}</p>
              <p class="history__meta">
                <time :datetime="event.created_at">{{ formatDateTime(event.created_at) }}</time>
                <span v-if="event.actor"> · {{ event.actor.email }}</span>
                <Text
                  v-else
                  k="admin.lead.historySystem"
                  as="span"
                  variant="caption"
                  tone="muted"
                />
              </p>
            </li>
          </ol>
        </Stack>
      </section>
    </Stack>

    <Dialog
      v-model:open="cancelOpen"
      title="admin.bookings.drawer.cancelTitle"
      :title-args="{ number: booking?.public_number ?? 0 }"
      confirm-label="admin.bookings.drawer.cancelConfirm"
      cancel-label="admin.bookings.drawer.cancelKeep"
      tone="danger"
      :loading="changeStatus.isPending.value"
      @confirm="confirmCancel"
    >
      <Stack :gap="3">
        <Field
          v-slot="{ id: fieldId, describedBy, invalid }"
          label="admin.bookings.drawer.cancelReasonLabel"
          :error="reasonError"
          required
        >
          <Textarea
            :id="fieldId"
            v-model="cancelReason"
            :aria-describedby="describedBy"
            :invalid="invalid"
            :rows="3"
            :maxlength="300"
          />
        </Field>
        <Checkbox v-if="booking?.has_max" v-model="cancelNotify" name="cancel-notify">
          <Text k="admin.bookings.drawer.notify" as="span" />
        </Checkbox>
      </Stack>
    </Dialog>
  </Drawer>
</template>

<style scoped>
.facts {
  display: grid;
  gap: var(--space-4);
  margin: 0;
}

.facts__value {
  margin: var(--space-1) 0 0;
  overflow-wrap: anywhere;
}

.facts__message {
  white-space: pre-wrap;
}

.move {
  padding: var(--space-4);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
}

.history {
  display: grid;
  gap: var(--space-4);
  margin: 0;
  padding: 0;
  list-style: none;
}

.history__event {
  padding-inline-start: var(--space-3);
  border-inline-start: 3px solid var(--color-border-strong);
}

.history__note {
  margin: 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.history__meta {
  margin: var(--space-1) 0 0;
  color: var(--color-text-muted);
  font-size: var(--text-sm);
}
</style>
