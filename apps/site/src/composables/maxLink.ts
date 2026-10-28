import siteConfig from '../../site.config'

/** Ссылка на бота; `startParam` открывает мини-приложение с параметром (`s_<slug>` — услуга). */
export function buildMaxBotLink(startParam?: string): string {
  const base = `https://max.ru/${siteConfig.max.botUsername}`
  return startParam ? `${base}?startapp=${encodeURIComponent(startParam)}` : base
}

export const serviceStartParam = (slug: string): string => `s_${slug}`
