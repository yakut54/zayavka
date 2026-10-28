import type { components } from '@app/api-client'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import type { ContactProof } from '../bridge/types'

export type BookingView = components['schemas']['BookingView']
export type ResourceChoice = 'any' | string

/** Черновик записи: выбор на шагах сохраняется при возвратах; зависимые значения сбрасываются. */
export const useBookingDraft = defineStore('bookingDraft', () => {
  const serviceSlug = ref<string | null>(null)
  const resource = ref<ResourceChoice | null>(null)
  const date = ref<string | null>(null)
  const startsAt = ref<string | null>(null)
  const name = ref('')
  const phone = ref('')
  const contactProof = ref<ContactProof | null>(null)
  const comment = ref('')
  const consent = ref(false)
  const idempotencyKey = ref<string | null>(null)
  /** Перенос существующей записи: услуга и специалист берутся из неё. */
  const rescheduling = ref<BookingView | null>(null)
  /** При переносе клиент выбрал «Другой специалист»: шаг специалиста входит в цепочку. */
  const changingResource = ref(false)
  /** Ошибки полей от сервера (422): показываются на шаге контактов. */
  const serverErrors = ref<{ field: string; code: string }[]>([])
  /** Созданная или перенесённая запись для экрана успеха. */
  const completed = ref<BookingView | null>(null)

  const isReschedule = computed(() => rescheduling.value !== null)

  function resetSlot(): void {
    date.value = null
    startsAt.value = null
    idempotencyKey.value = null
  }

  function setService(slug: string): void {
    if (serviceSlug.value === slug) return
    serviceSlug.value = slug
    resource.value = null
    resetSlot()
  }

  function setResource(choice: ResourceChoice): void {
    if (resource.value === choice) return
    resource.value = choice
    resetSlot()
  }

  function setDate(value: string): void {
    if (date.value === value) return
    date.value = value
    startsAt.value = null
    idempotencyKey.value = null
  }

  function setSlot(value: string): void {
    startsAt.value = value
    idempotencyKey.value = null
  }

  /** Ключ создаётся один раз при входе на подтверждение и переживает повторные отправки. */
  function ensureIdempotencyKey(): string {
    idempotencyKey.value ??= crypto.randomUUID()
    return idempotencyKey.value
  }

  function startReschedule(booking: BookingView): void {
    reset()
    rescheduling.value = booking
    serviceSlug.value = booking.service.slug
    resource.value = booking.resource.id
  }

  function changeResourceForReschedule(): void {
    changingResource.value = true
    resource.value = null
    resetSlot()
  }

  /** Имя и телефон остаются: клиент вводил их, и они нужны следующей записи. */
  function reset(): void {
    serviceSlug.value = null
    resource.value = null
    resetSlot()
    comment.value = ''
    consent.value = false
    rescheduling.value = null
    changingResource.value = false
    serverErrors.value = []
  }

  return {
    serviceSlug,
    resource,
    date,
    startsAt,
    name,
    phone,
    contactProof,
    comment,
    consent,
    idempotencyKey,
    rescheduling,
    changingResource,
    serverErrors,
    completed,
    isReschedule,
    setService,
    setResource,
    setDate,
    setSlot,
    ensureIdempotencyKey,
    startReschedule,
    changeResourceForReschedule,
    reset,
  }
})
