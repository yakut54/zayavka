import { type Ref, computed, ref, watch } from 'vue'

import { addDays, todayIn } from '../../lib/time'
import { type Day, fetchDays } from './api'

export const DAYS_CHUNK = 14

/**
 * Лента дат порциями по 14 дней (раздел 10.4 ТЗ): следующая порция подгружается при прокрутке
 * к концу, но не дальше горизонта записи.
 */
export function useDays(
  service: Ref<string | null>,
  resource: Ref<string | null>,
  horizonDays: Ref<number>,
  tz: Ref<string>,
) {
  const days = ref<Day[]>([])
  const loading = ref(false)
  const error = ref<unknown>(null)
  const loadedUntil = ref('')
  let generation = 0

  const start = computed(() => todayIn(tz.value))
  const end = computed(() => addDays(start.value, horizonDays.value - 1))
  const hasMore = computed(() => loadedUntil.value !== '' && loadedUntil.value < end.value)

  async function loadMore(): Promise<void> {
    if (loading.value || !service.value || !resource.value) return
    const from = loadedUntil.value ? addDays(loadedUntil.value, 1) : start.value
    if (from > end.value) return
    const chunkEnd = addDays(from, DAYS_CHUNK - 1)
    const to = chunkEnd < end.value ? chunkEnd : end.value
    const mine = generation
    loading.value = true
    error.value = null
    try {
      const chunk = await fetchDays(service.value, resource.value, from, to)
      if (mine !== generation) return
      days.value = [...days.value, ...chunk]
      loadedUntil.value = to
    } catch (failure) {
      if (mine === generation) error.value = failure
    } finally {
      if (mine === generation) loading.value = false
    }
  }

  function reload(): void {
    generation += 1
    days.value = []
    loadedUntil.value = ''
    loading.value = false
    error.value = null
    void loadMore()
  }

  watch([service, resource], reload, { immediate: true })

  return { days, loading, error, hasMore, loadMore, reload }
}
