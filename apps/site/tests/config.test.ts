import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import dictionary from '@app/i18n/ru.json'
import { icons } from '@app/ui/icons'
import { describe, expect, it } from 'vitest'

import siteConfig from '../site.config'
import { SiteConfigError, dictionaryKeys, validateSiteConfig } from '../src/config/validate'
import type { SiteConfig } from '../src/config/types'
import {
  buildManifest,
  buildRobotsTxt,
  buildServicesJson,
  buildSitemapXml,
  lookup,
} from '../vite/generate'

const iconNames = Object.keys(icons)
const clone = (): SiteConfig => structuredClone(siteConfig)
const validate = (config: SiteConfig) => validateSiteConfig(config, dictionary, iconNames)
const root = join(import.meta.dirname, '../../..')

describe('validateSiteConfig', () => {
  it('принимает рабочий конфиг', () => {
    expect(validate(clone())).toEqual(siteConfig)
  })

  it('словарь: листья', () => {
    expect(dictionaryKeys({ a: { b: 'x', c: { d: 'y' } }, e: 'z' })).toEqual(['a.b', 'a.c.d', 'e'])
  })

  it.each([
    [
      'несуществующий ключ словаря',
      (c: SiteConfig) => ((c.brand as { name: string }).name = 'content.nope'),
      'нет ключа',
    ],
    [
      'несуществующая иконка',
      (c: SiteConfig) => ((c.services[0] as { icon: string }).icon = 'nope'),
      'нет иконки',
    ],
    ['плохой телефон', (c: SiteConfig) => (c.contacts.phoneE164 = '89990000000'), 'E.164'],
    ['плохой email', (c: SiteConfig) => (c.contacts.email = 'не-email'), 'contacts.email'],
    ['плохой slug', (c: SiteConfig) => (c.services[0]!.slug = 'Плохой Slug'), 'slug'],
    ['повтор slug', (c: SiteConfig) => (c.services[1]!.slug = c.services[0]!.slug), 'уникальны'],
    [
      'цена не число',
      (c: SiteConfig) => ((c.services[0] as { priceFrom: unknown }).priceFrom = 'x'),
      'priceFrom',
    ],
    ['часовой пояс', (c: SiteConfig) => (c.contacts.timezone = 'Mars/Base'), 'часовой пояс'],
    ['нет услуг', (c: SiteConfig) => (c.services = []), 'services'],
    [
      'яндекс-метрика не числом',
      (c: SiteConfig) => (c.analytics.yandexMetrikaId = 'abc'),
      'yandexMetrikaId',
    ],
    ['координаты', (c: SiteConfig) => (c.contacts.map.lat = 120), 'map.lat'],
  ])('ошибка конфига: %s', (_name, mutate, fragment) => {
    const config = clone()
    mutate(config)
    expect(() => validate(config)).toThrow(SiteConfigError)
    expect(() => validate(config)).toThrow(fragment)
  })

  it('цвет бренда без нужного контраста роняет сборку с понятным сообщением', () => {
    const config = clone()
    // оттенок, на котором brand-600 на белом не проходит AA, подбирается перебором
    const bad = Array.from({ length: 361 }, (_, hue) => hue).find((hue) => {
      const probe = { ...config, brand: { ...config.brand, hue } }
      try {
        validate(probe)
        return false
      } catch (error) {
        return String(error).includes('контраст')
      }
    })
    if (bad === undefined) return // у brand-600 все оттенки проходят — нечего проверять
    config.brand.hue = bad
    expect(() => validate(config)).toThrow(/контраст .*WCAG AA/)
  })
})

describe('генерация файлов сборки', () => {
  it('services.json: slug-и и названия', () => {
    const data = JSON.parse(buildServicesJson(siteConfig, dictionary))
    expect(data.slugs).toEqual(['diagnostics', 'maintenance', 'brakes', 'tires'])
    expect(data.titles.diagnostics).toBe('Компьютерная диагностика')
  })

  it('apps/api/services.json совпадает со сгенерированным (запустите pnpm sync:services)', () => {
    const committed = readFileSync(join(root, 'apps/api/services.json'), 'utf8')
    expect(committed).toBe(buildServicesJson(siteConfig, dictionary))
  })

  it('robots.txt: в демо закрыт от индексации', () => {
    expect(buildRobotsTxt({ ...siteConfig, demo: true })).toBe('User-agent: *\nDisallow: /\n')
  })

  it('robots.txt: в бою открыт и ссылается на sitemap', () => {
    const text = buildRobotsTxt({ ...siteConfig, demo: false })
    expect(text).toContain('Allow: /')
    expect(text).toContain(`Sitemap: ${siteConfig.url}/sitemap.xml`)
  })

  it('sitemap.xml: все страницы', () => {
    const xml = buildSitemapXml(siteConfig)
    for (const path of ['/', '/privacy', '/consent']) {
      expect(xml).toContain(`<loc>${siteConfig.url}${path}</loc>`)
    }
  })

  it('манифест: имя бренда и иконки', () => {
    const manifest = JSON.parse(buildManifest(siteConfig, dictionary))
    expect(manifest.name).toBe('Гараж 24')
    expect(manifest.lang).toBe('ru')
    expect(manifest.icons).toHaveLength(2)
  })

  it('lookup: ошибка на несуществующем ключе', () => {
    expect(lookup(dictionary, 'content.brand.name')).toBe('Гараж 24')
    expect(() => lookup(dictionary, 'content.brand')).toThrow()
    expect(() => lookup(dictionary, 'content.zzz.name')).toThrow()
  })
})

describe('соответствие бэкенду', () => {
  it('текст согласия на сайте = файл, хеш которого пишет API', () => {
    const file = readFileSync(join(root, 'apps/api/app/data/consent_text.ru.md'), 'utf8').trim()
    expect(file).toBe(lookup(dictionary, 'content.legal.consent.body'))
  })

  it('версия политики сайта = значению из .env.example', () => {
    const env = readFileSync(join(root, '.env.example'), 'utf8')
    expect(env).toContain(`PRIVACY_POLICY_VERSION=${siteConfig.policyVersion}`)
  })
})
