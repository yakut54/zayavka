import type { MessageKey } from '@app/i18n'

/** Настройки админки под конкретного клиента (white-label). */
export const adminConfig = {
  brandName: 'content.brand.name' as MessageKey,
  /** Часовой пояс бизнеса для отображения дат. */
  timezone: 'Asia/Novosibirsk',
  /** slug услуги → название (совпадает с services.json сайта и API). */
  services: {
    diagnostics: 'content.services.diagnostics.title',
    maintenance: 'content.services.maintenance.title',
    brakes: 'content.services.brakes.title',
    tires: 'content.services.tires.title',
  } as Record<string, MessageKey>,
  pageSize: 25,
  newLeadsRefreshMs: 60_000,
}
