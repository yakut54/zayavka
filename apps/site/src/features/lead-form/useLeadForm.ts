import { useForm } from '@app/ui'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import siteConfig from '../../../site.config'
import { trackGoal } from '../../composables/useAnalytics'
import { selectedService } from '../../composables/useLeadFormBus'
import { type LeadCreate, type SubmitResult, submitLead } from './api'
import { leadInitial, leadSchema } from './schema'

export type FormStatus = 'idle' | 'success' | 'rate-limited' | 'network-error' | 'server-error'

const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'] as const
const UTM_MAX = 200

/** UTM-метки читаются из URL и держатся в памяти (не в localStorage). */
export function readUtm(search: string): LeadCreate['utm'] {
  const params = new URLSearchParams(search)
  const utm: Record<string, string> = {}
  for (const key of UTM_KEYS) {
    const value = params.get(key)
    if (value) utm[key] = value.slice(0, UTM_MAX)
  }
  return utm
}

export function buildPayload(
  values: { name: string; phone: string; email: string; serviceSlug: string; message: string },
  extra: { website: string; elapsedMs: number; utm: LeadCreate['utm'] },
): LeadCreate {
  return {
    name: values.name.trim(),
    phone: `+${values.phone}`,
    email: values.email.trim() || null,
    message: values.message.trim() || null,
    service_slug: values.serviceSlug || null,
    consent: true,
    policy_version: siteConfig.policyVersion,
    utm: extra.utm,
    website: extra.website,
    elapsed_ms: Math.max(0, Math.round(extra.elapsedMs)),
  }
}

export function useLeadForm() {
  const status = ref<FormStatus>('idle')
  const submittedNumber = ref<number | null>(null)
  const blockedUntil = ref(0)
  const now = ref(Date.now())
  let mountedAt = 0
  let utm: LeadCreate['utm'] = {}
  let tick: ReturnType<typeof setInterval> | undefined

  const form = useForm({
    schema: leadSchema,
    initial: leadInitial,
    onSubmit: async (values) => {
      const result = await submitLead(
        buildPayload(values, {
          website: String(form.values.website ?? ''),
          elapsedMs: performance.now() - mountedAt,
          utm,
        }),
      )
      handle(result)
    },
  })

  function handle(result: SubmitResult): void {
    switch (result.kind) {
      case 'ok':
        submittedNumber.value = result.number
        status.value = 'success'
        trackGoal('lead_submitted')
        break
      case 'validation':
        status.value = 'idle'
        form.setServerErrors(result.errors)
        void nextTick().then(() => {
          const first = form.errorList.value[0]
          if (first) form.focusField(first.name)
        })
        break
      case 'rate-limited':
        blockedUntil.value = Date.now() + result.retryAfterSeconds * 1000
        now.value = Date.now()
        status.value = 'rate-limited'
        break
      case 'network':
        status.value = 'network-error'
        break
      case 'server-error':
        status.value = 'server-error'
        break
    }
  }

  const blocked = computed(() => status.value === 'rate-limited' && now.value < blockedUntil.value)
  const retryMinutes = computed(() =>
    Math.max(1, Math.ceil((blockedUntil.value - now.value) / 60_000)),
  )

  watch(blocked, (value, previous) => {
    if (previous && !value) status.value = 'idle'
  })

  watch(selectedService, (slug) => {
    if (slug) form.values.serviceSlug = slug
  })

  function startAnother(): void {
    form.reset()
    submittedNumber.value = null
    status.value = 'idle'
    mountedAt = performance.now()
  }

  onMounted(() => {
    mountedAt = performance.now()
    utm = readUtm(window.location.search)
    if (selectedService.value) form.values.serviceSlug = selectedService.value
    tick = setInterval(() => {
      now.value = Date.now()
    }, 1000)
  })

  onBeforeUnmount(() => clearInterval(tick))

  return { form, status, submittedNumber, blocked, retryMinutes, startAnother }
}
