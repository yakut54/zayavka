import { ApiError } from '@app/api-client'
import type { MessageArgs, MessageKey } from '@app/i18n'
import { useToast } from '@app/ui'
import { useQueryClient } from '@tanstack/vue-query'
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'

import { useMaxBridge } from '../../bridge/useMaxBridge'
import { type BookingView, useBookingDraft } from '../../stores/bookingDraft'
import { errorCode, errorMessage, useBootstrap } from '../launch/useBootstrap'
import { createBooking, rescheduleBooking } from './api'

export interface SubmitAlert {
  key: MessageKey
  args?: MessageArgs
}

/** Отправка записи или переноса и разбор ответов сервера (раздел 10.4 ТЗ). */
export function useSubmit() {
  const draft = useBookingDraft()
  const bootstrap = useBootstrap()
  const bridge = useMaxBridge()
  const router = useRouter()
  const toast = useToast()
  const queryClient = useQueryClient()

  const submitting = ref(false)
  const alert = ref<SubmitAlert | null>(null)

  const resourceId = computed(() => (draft.resource === 'any' ? null : draft.resource))

  function perform(): Promise<BookingView> {
    // Ключ создаётся один раз при входе на шаг и переживает повторные отправки.
    const key = draft.ensureIdempotencyKey()
    const startsAt = draft.startsAt as string
    if (draft.rescheduling) {
      return rescheduleBooking(
        draft.rescheduling.id,
        { starts_at: startsAt, resource_id: resourceId.value, version: draft.rescheduling.version },
        key,
      )
    }
    return createBooking(
      {
        service_slug: draft.serviceSlug as string,
        resource_id: resourceId.value,
        starts_at: startsAt,
        name: draft.name,
        phone: `+${draft.phone}`,
        contact_proof: draft.contactProof,
        comment: draft.comment || null,
        consent: true,
        policy_version: bootstrap.value.legal.policy_version,
      },
      key,
    )
  }

  async function failed(error: unknown): Promise<void> {
    bridge.haptic.error()
    if (!(error instanceof ApiError)) {
      alert.value = { key: 'errors.api.internal_error' }
      return
    }
    if (error.status === 409 && error.code === 'slot_taken') {
      toast.error('errors.api.slot_taken')
      await queryClient.invalidateQueries({ queryKey: ['slots'] })
      draft.setSlot('')
      await router.push({ name: 'book-time' })
    } else if (error.status === 422 && !draft.isReschedule && error.errors.length > 0) {
      draft.serverErrors = error.errors
      await router.push({ name: 'book-contacts' })
    } else if (error.status === 429) {
      const minutes = Math.max(1, Math.ceil((error.retryAfter ?? 60) / 60))
      alert.value = { key: 'errors.api.rate_limited', args: { minutes } }
    } else if (error.status === 0) {
      alert.value = { key: 'miniapp.confirm.noConnection' }
    } else if (['too_late_to_change', 'booking_not_active', 'not_owner'].includes(error.code)) {
      toast.error(errorMessage(error.code))
      await queryClient.invalidateQueries({ queryKey: ['bookings'] })
      draft.reset()
      await router.replace({ name: 'home', query: { tab: 'mine' } })
    } else {
      alert.value = { key: errorMessage(errorCode(error)) }
    }
  }

  async function submit(): Promise<void> {
    if (submitting.value) return
    submitting.value = true
    alert.value = null
    try {
      const booking = await perform()
      draft.completed = booking
      draft.reset()
      bridge.closingConfirmation(false)
      bridge.haptic.success()
      await queryClient.invalidateQueries({ queryKey: ['bookings'] })
      await router.replace({ name: 'done' })
    } catch (error) {
      await failed(error)
    } finally {
      submitting.value = false
    }
  }

  return { submit, submitting, alert }
}
