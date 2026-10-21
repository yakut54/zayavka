import { T } from '@app/i18n'

import type { SiteConfig } from '../config/types'

/** LocalBusiness: только данные из конфига (в демо — тестовые, с пометкой в описании). */
export function localBusinessJsonLd(config: SiteConfig): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'AutoRepair',
    name: T(config.brand.name),
    description: T(config.seo.description),
    url: config.url,
    telephone: config.contacts.phoneE164,
    email: config.contacts.email,
    address: { '@type': 'PostalAddress', streetAddress: T(config.contacts.address) },
    openingHours: T(config.contacts.workingHours),
  }
}

export function faqJsonLd(config: SiteConfig): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: config.faq.map((item) => ({
      '@type': 'Question',
      name: T(item.question),
      acceptedAnswer: { '@type': 'Answer', text: T(item.answer) },
    })),
  }
}
