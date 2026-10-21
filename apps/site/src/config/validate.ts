import { z } from 'zod'

import { AA_TEXT, brandAccentContrast } from '@app/ui/contrast'

import type { SiteConfig } from './types'

/** Листья словаря: `common.retry`, `content.brand.name`, … */
export function dictionaryKeys(node: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(node).flatMap(([key, value]) =>
    typeof value === 'object' && value !== null
      ? dictionaryKeys(value as Record<string, unknown>, `${prefix}${key}.`)
      : [`${prefix}${key}`],
  )
}

export class SiteConfigError extends Error {
  constructor(problems: string[]) {
    super(`Ошибка site.config.ts:\n  - ${problems.join('\n  - ')}`)
    this.name = 'SiteConfigError'
  }
}

/** Проверка конфига при сборке: ошибка = упавшая сборка с понятным сообщением. */
export function validateSiteConfig(
  config: SiteConfig,
  dictionary: Record<string, unknown>,
  iconNames: readonly string[],
): SiteConfig {
  const keys = new Set(dictionaryKeys(dictionary))
  const key = z.string().refine((value) => keys.has(value), {
    error: (issue) => `нет ключа «${String(issue.input)}» в словаре @app/i18n`,
  })
  const icon = z.string().refine((value) => iconNames.includes(value), {
    error: (issue) => `нет иконки «${String(issue.input)}»`,
  })

  const schema = z.object({
    demo: z.boolean(),
    url: z.url(),
    policyVersion: z.string().min(1),
    policyDate: z.iso.date(),
    brand: z.object({ name: key, hue: z.number().min(0).max(360) }),
    hero: z.object({ title: key, subtitle: key, imageAlt: key }),
    contacts: z.object({
      phoneE164: z
        .string()
        .regex(/^\+[1-9]\d{7,14}$/, 'телефон в формате E.164, например +70000000000'),
      email: z.email(),
      address: key,
      workingHours: key,
      map: z.object({
        lat: z.number().min(-90).max(90),
        lon: z.number().min(-180).max(180),
        zoom: z.number().int().min(1).max(21),
      }),
      timezone: z.string().refine((tz) => {
        try {
          new Intl.DateTimeFormat('ru-RU', { timeZone: tz })
          return true
        } catch {
          return false
        }
      }, 'неизвестный часовой пояс'),
    }),
    services: z
      .array(
        z.object({
          slug: z
            .string()
            .regex(/^[a-z0-9-]{1,64}$/, 'slug: строчные латинские буквы, цифры и дефис'),
          title: key,
          description: key,
          priceFrom: z.number().int().positive(),
          icon,
          bookable: z.boolean().optional(),
          durationMin: z.number().int().min(5).max(480).multipleOf(5).optional(),
          bufferMin: z.number().int().min(0).max(120).optional(),
        }),
      )
      .min(1)
      .refine(
        (items) => new Set(items.map((s) => s.slug)).size === items.length,
        'slug услуг должны быть уникальны',
      )
      .refine(
        (items) =>
          items.every(
            (s) => !s.bookable || (s.durationMin !== undefined && s.bufferMin !== undefined),
          ),
        'для услуг с bookable: true обязательны durationMin и bufferMin',
      ),
    advantages: z
      .array(z.object({ icon, title: key, text: key }))
      .min(3)
      .max(4),
    process: z.array(z.object({ title: key, text: key })).min(2),
    faq: z.array(z.object({ question: key, answer: key })),
    seo: z.object({ title: key, description: key }),
    analytics: z.object({ yandexMetrikaId: z.string().regex(/^\d+$/).nullable() }),
    leadForm: z.object({ callbackMinutes: z.number().int().positive() }),
    max: z.object({
      bookingEnabled: z.boolean(),
      botUsername: z.string().regex(/^[A-Za-z0-9_]{3,64}$/, 'имя бота: латиница, цифры, _'),
      miniAppUrl: z.url({ protocol: /^https$/ }),
      supportContact: key,
      operator: key,
    }),
  })

  const parsed = schema.safeParse(config)
  const problems = parsed.success
    ? []
    : parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`)

  const ratio = brandAccentContrast(config.brand.hue)
  if (ratio < AA_TEXT) {
    problems.push(
      `brand.hue=${config.brand.hue}: акцентный цвет на белом даёт контраст ${ratio.toFixed(2)}:1, нужно не меньше ${AA_TEXT}:1 (WCAG AA). Подберите другой оттенок.`,
    )
  }
  if (problems.length > 0) throw new SiteConfigError(problems)
  return config
}
