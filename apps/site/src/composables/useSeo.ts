import { T, type MessageKey } from '@app/i18n'
import { useHead } from '@unhead/vue'

import siteConfig from '../../site.config'

export interface SeoOptions {
  /** Заголовок страницы; для главной — `content.seo.title` целиком. */
  title: MessageKey
  description: MessageKey
  path: string
  /** Заголовок = title без добавления названия бренда. */
  fullTitle?: boolean
  noindex?: boolean
  jsonLd?: Record<string, unknown>[]
}

/** Заголовок, описание, canonical, Open Graph, Twitter-карточка и JSON-LD страницы (раздел 12.5 ТЗ). */
export function useSeo(options: SeoOptions): void {
  const brand = T(siteConfig.brand.name)
  const title = options.fullTitle ? T(options.title) : `${T(options.title)} — ${brand}`
  const description = T(options.description)
  const url = `${siteConfig.url}${options.path}`
  const image = `${siteConfig.url}/generated/og.png`

  useHead({
    title,
    meta: [
      { name: 'description', content: description },
      ...(options.noindex ? [{ name: 'robots', content: 'noindex, nofollow' }] : []),
      { property: 'og:type', content: 'website' },
      { property: 'og:locale', content: 'ru_RU' },
      { property: 'og:site_name', content: brand },
      { property: 'og:title', content: title },
      { property: 'og:description', content: description },
      { property: 'og:url', content: url },
      { property: 'og:image', content: image },
      { property: 'og:image:width', content: '1200' },
      { property: 'og:image:height', content: '630' },
      { name: 'twitter:card', content: 'summary_large_image' },
      { name: 'twitter:title', content: title },
      { name: 'twitter:description', content: description },
      { name: 'twitter:image', content: image },
    ],
    link: [{ rel: 'canonical', href: url }],
    script: (options.jsonLd ?? []).map((data) => ({
      type: 'application/ld+json',
      innerHTML: JSON.stringify(data),
    })),
  })
}
