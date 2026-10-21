import dictionary from '@app/i18n/ru.json'
import { icons } from '@app/ui/icons'
import { describe, expect, it } from 'vitest'

import siteConfig from '../site.config'
import type { SiteConfig } from '../src/config/types'
import { SiteConfigError, validateSiteConfig } from '../src/config/validate'
import { buildServicesJson } from '../vite/generate'

const iconNames = Object.keys(icons)

function withService(patch: Record<string, unknown>): SiteConfig {
  const config = structuredClone(siteConfig)
  Object.assign(config.services[0] as object, patch)
  return config
}

const validate = (config: SiteConfig) => validateSiteConfig(config, dictionary, iconNames)

describe('каталог услуг для онлайн-записи', () => {
  it('демо-услуги доступны для записи', () => {
    expect(siteConfig.services.every((s) => s.bookable)).toBe(true)
  })

  it('услуга без bookable не требует длительности', () => {
    const config = withService({
      bookable: undefined,
      durationMin: undefined,
      bufferMin: undefined,
    })
    expect(() => validate(config)).not.toThrow()
  })

  it.each([
    ['нет durationMin', { durationMin: undefined }],
    ['нет bufferMin', { bufferMin: undefined }],
  ])('bookable: true, но %s — ошибка', (_name, patch) => {
    expect(() => validate(withService(patch))).toThrow(/durationMin и bufferMin/)
  })

  it.each([
    ['длительность не кратна 5', { durationMin: 42 }],
    ['длительность меньше 5', { durationMin: 0 }],
    ['длительность больше 480', { durationMin: 485 }],
    ['буфер отрицательный', { bufferMin: -5 }],
    ['буфер больше 120', { bufferMin: 125 }],
  ])('%s — ошибка', (_name, patch) => {
    expect(() => validate(withService(patch))).toThrow(SiteConfigError)
  })

  it('граничные значения допустимы', () => {
    expect(() => validate(withService({ durationMin: 5, bufferMin: 0 }))).not.toThrow()
    expect(() => validate(withService({ durationMin: 480, bufferMin: 120 }))).not.toThrow()
  })

  it('services.json содержит длительности для API', () => {
    const data = JSON.parse(buildServicesJson(siteConfig, dictionary))
    const tires = data.services.find((s: { slug: string }) => s.slug === 'tires')
    expect(tires).toEqual({
      slug: 'tires',
      title: 'Шиномонтаж',
      priceFrom: 2000,
      bookable: true,
      durationMin: 45,
      bufferMin: 10,
    })
  })

  it('для услуги без записи длительность в services.json не пишется', () => {
    const config = withService({ bookable: false })
    const data = JSON.parse(buildServicesJson(config, dictionary))
    expect(data.services[0]).toEqual({
      slug: 'diagnostics',
      title: 'Компьютерная диагностика',
      priceFrom: 1500,
      bookable: false,
    })
  })
})
