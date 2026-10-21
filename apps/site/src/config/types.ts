import type { MessageKey } from '@app/i18n'
import type { IconName } from '@app/ui'

export interface ServiceConfig {
  /** Совпадает со slug в services.json, который читает API. */
  slug: string
  title: MessageKey
  description: MessageKey
  priceFrom: number
  icon: IconName
  /** Доступна для онлайн-записи (проект 2). По умолчанию false. */
  bookable?: boolean
  /** Длительность услуги, мин: 5–480, кратно 5. Обязательна при bookable. */
  durationMin?: number
  /** Буфер после услуги (уборка, подготовка), мин: 0–120. Обязателен при bookable. */
  bufferMin?: number
}

export interface SiteConfig {
  /** Плашка «Демо-проект» и `Disallow: /` в robots.txt. */
  demo: boolean
  /** Канонический адрес сайта (sitemap, canonical, Open Graph). */
  url: string
  /** Версия политики: должна совпадать с PRIVACY_POLICY_VERSION у API. */
  policyVersion: string
  /** Дата вступления политики в силу (ISO). */
  policyDate: string
  brand: { name: MessageKey; hue: number }
  hero: { title: MessageKey; subtitle: MessageKey; imageAlt: MessageKey }
  contacts: {
    phoneE164: string
    email: string
    address: MessageKey
    workingHours: MessageKey
    timezone: string
    map: { lat: number; lon: number; zoom: number }
  }
  services: ServiceConfig[]
  advantages: { icon: IconName; title: MessageKey; text: MessageKey }[]
  process: { title: MessageKey; text: MessageKey }[]
  faq: { question: MessageKey; answer: MessageKey }[]
  seo: { title: MessageKey; description: MessageKey }
  analytics: { yandexMetrikaId: string | null }
  leadForm: { callbackMinutes: number }
  /** Мини-приложение MAX (проект 2). */
  max: {
    bookingEnabled: boolean
    /** Имя бота без @; для ссылок «Записаться онлайн». */
    botUsername: string
    miniAppUrl: string
    /** Контакты поддержки и сведения об операторе — ключи словаря. */
    supportContact: MessageKey
    operator: MessageKey
  }
}

/** Идентичность с типизацией: проверка значений выполняется при сборке (vite/site-plugin). */
export function defineSiteConfig(config: SiteConfig): SiteConfig {
  return config
}
