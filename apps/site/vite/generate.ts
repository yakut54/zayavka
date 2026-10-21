import type { SiteConfig } from '../src/config/types'

type Dictionary = Record<string, unknown>

/** Значение по ключу `content.brand.name`. */
export function lookup(dictionary: Dictionary, key: string): string {
  let node: unknown = dictionary
  for (const part of key.split('.')) {
    if (typeof node !== 'object' || node === null) throw new Error(`нет ключа ${key}`)
    node = (node as Dictionary)[part]
  }
  if (typeof node !== 'string') throw new Error(`нет ключа ${key}`)
  return node
}

/** services.json: slug-и для проверки `service_slug` на API и названия для писем и CSV. */
export function buildServicesJson(config: SiteConfig, dictionary: Dictionary): string {
  const data = {
    slugs: config.services.map((s) => s.slug),
    titles: Object.fromEntries(config.services.map((s) => [s.slug, lookup(dictionary, s.title)])),
    business: {
      name: lookup(dictionary, config.brand.name),
      phone: config.contacts.phoneE164,
      address: lookup(dictionary, config.contacts.address),
      workingHours: lookup(dictionary, config.contacts.workingHours),
      timezone: config.contacts.timezone,
      siteUrl: config.url,
      policyVersion: config.policyVersion,
      support: lookup(dictionary, config.max.supportContact),
      operator: lookup(dictionary, config.max.operator),
      botUsername: config.max.botUsername,
    },
    services: config.services.map((s) => ({
      slug: s.slug,
      title: lookup(dictionary, s.title),
      priceFrom: s.priceFrom,
      bookable: s.bookable ?? false,
      ...(s.bookable ? { durationMin: s.durationMin, bufferMin: s.bufferMin } : {}),
    })),
  }
  return `${JSON.stringify(data, null, 2)}\n`
}

export function buildRobotsTxt(config: SiteConfig): string {
  if (config.demo) return 'User-agent: *\nDisallow: /\n'
  return `User-agent: *\nAllow: /\n\nSitemap: ${config.url}/sitemap.xml\n`
}

export const SITE_PATHS = ['/', '/privacy', '/consent'] as const

export function buildSitemapXml(config: SiteConfig): string {
  const urls = SITE_PATHS.map(
    (path) => `  <url><loc>${config.url}${path === '/' ? '/' : path}</loc></url>`,
  )
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`
}

export function buildManifest(config: SiteConfig, dictionary: Dictionary): string {
  const name = lookup(dictionary, config.brand.name)
  return `${JSON.stringify(
    {
      name,
      short_name: name,
      lang: 'ru',
      start_url: '/',
      display: 'standalone',
      background_color: '#ffffff',
      theme_color: '#ffffff',
      icons: [
        { src: '/generated/icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: '/generated/icon-512.png', sizes: '512x512', type: 'image/png' },
      ],
    },
    null,
    2,
  )}\n`
}
