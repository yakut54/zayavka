import { ref } from 'vue'

export type AnalyticsConsent = 'granted' | 'denied' | null

const STORAGE_KEY = 'analytics-consent'

export const analyticsConsent = ref<AnalyticsConsent>(null)

declare global {
  interface Window {
    ym?: (id: number, method: string, ...args: unknown[]) => void
  }
}

let metrikaId: string | null = null

export function readStoredConsent(): AnalyticsConsent {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY)
    return value === 'granted' || value === 'denied' ? value : null
  } catch {
    return null
  }
}

function storeConsent(value: Exclude<AnalyticsConsent, null>): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, value)
  } catch {
    // хранилище недоступно — выбор действует до перезагрузки
  }
}

function loadMetrika(id: string): void {
  if (document.querySelector('script[data-metrika]')) return
  const script = document.createElement('script')
  script.async = true
  script.src = 'https://mc.yandex.ru/metrika/tag.js'
  script.dataset.metrika = id
  script.addEventListener('load', () => window.ym?.(Number(id), 'init', { defer: false }))
  document.head.append(script)
}

/** До явного согласия скрипт аналитики не загружается. */
export function initAnalytics(id: string | null): void {
  metrikaId = id
  if (!id) return
  analyticsConsent.value = readStoredConsent()
  if (analyticsConsent.value === 'granted') loadMetrika(id)
}

export function setConsent(value: Exclude<AnalyticsConsent, null>): void {
  analyticsConsent.value = value
  storeConsent(value)
  if (value === 'granted' && metrikaId) loadMetrika(metrikaId)
}

/** Цель аналитики — только если аналитика включена и разрешена. */
export function trackGoal(goal: string): void {
  if (!metrikaId || analyticsConsent.value !== 'granted') return
  window.ym?.(Number(metrikaId), 'reachGoal', goal)
}
