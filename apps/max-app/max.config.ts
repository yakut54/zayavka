export const DEMO_ENABLED = import.meta.env.VITE_DEMO === 'true'

/** Настройки мини-приложения под конкретного клиента (white-label). */
export const maxConfig = {
  /** Ссылка на бота; `?startapp=<param>` открывает мини-приложение с параметром. */
  botLink: 'https://max.ru/id0000000000_bot',
  /** Демо-режим вне MAX: код демо-моста попадает в сборку только при VITE_DEMO=true. */
  demo: DEMO_ENABLED,
  requestTimeoutMs: 15_000,
}

export function buildMaxBotLink(startParam?: string): string {
  return startParam
    ? `${maxConfig.botLink}?startapp=${encodeURIComponent(startParam)}`
    : maxConfig.botLink
}
