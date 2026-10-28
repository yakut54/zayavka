import { useRouter } from 'vue-router'

import { useBookingDraft } from '../../stores/bookingDraft'
import { useBootstrap } from '../launch/useBootstrap'

export type Step = 'service' | 'resource' | 'date' | 'time' | 'contacts' | 'confirm'

export const STEP_ROUTE: Record<Step, string> = {
  service: 'home',
  resource: 'book-resource',
  date: 'book-date',
  time: 'book-time',
  contacts: 'book-contacts',
  confirm: 'book-confirm',
}

/** Порядок шагов записи (раздел 10.4 ТЗ): специалист пропускается, если выбирать не из кого. */
export function useFlow() {
  const draft = useBookingDraft()
  const bootstrap = useBootstrap()
  const router = useRouter()

  function eligibleResources() {
    return bootstrap.value.resources.filter((r) =>
      draft.serviceSlug ? r.service_slugs.includes(draft.serviceSlug) : false,
    )
  }

  function steps(): Step[] {
    if (draft.isReschedule) {
      return [...(draft.changingResource ? (['resource'] as const) : []), 'date', 'time', 'confirm']
    }
    return [
      'service',
      ...(eligibleResources().length > 1 ? (['resource'] as const) : []),
      'date',
      'time',
      'contacts',
      'confirm',
    ]
  }

  function info(step: Step): { step: number; total: number } {
    const list = steps()
    return { step: Math.max(1, list.indexOf(step) + 1), total: list.length }
  }

  function neighbour(step: Step, delta: 1 | -1): Step | null {
    const list = steps()
    return list[list.indexOf(step) + delta] ?? null
  }

  /** Единственный подходящий специалист выбирается сам. */
  function autoPickResource(): void {
    if (draft.isReschedule) return
    const list = eligibleResources()
    if (list.length <= 1 && draft.resource === null) draft.setResource(list[0]?.id ?? 'any')
  }

  async function next(step: Step): Promise<void> {
    autoPickResource()
    const target = neighbour(step, 1)
    if (target) await router.push({ name: STEP_ROUTE[target] })
  }

  async function back(step: Step): Promise<void> {
    const target = neighbour(step, -1)
    await router.push({ name: target ? STEP_ROUTE[target] : 'home' })
  }

  return { steps, info, next, back, eligibleResources }
}
