import { flushPromises } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'

import siteConfig from '../site.config'
import { expectAccessible, mountApp } from './helpers'

describe('главная', () => {
  it('содержит все секции в нужном порядке с ровно одним h1', async () => {
    const { wrapper } = await mountApp('/')
    const html = wrapper.element
    expect(html.querySelectorAll('h1')).toHaveLength(1)
    expect(html.querySelector('h1')?.textContent).toBe('Ремонт и обслуживание авто без сюрпризов')
    const ids = [...html.querySelectorAll('section[id]')].map((s) => s.id)
    expect(ids).toEqual(['services', 'prices', 'process', 'faq', 'contacts', 'lead-form'])
    expect(html.querySelector('#advantages-title')).not.toBeNull()
  })

  it('порядок заголовков без пропусков (h1 → h2 → h3)', async () => {
    const { wrapper } = await mountApp('/')
    const levels = [...wrapper.element.querySelectorAll('h1,h2,h3,h4')].map((h) =>
      Number(h.tagName.slice(1)),
    )
    let previous = 0
    for (const level of levels) {
      expect(level - previous).toBeLessThanOrEqual(1)
      previous = level
    }
  })

  it('услуги: карточки с ценой «от», кнопка «Выбрать» у каждой', async () => {
    const { wrapper } = await mountApp('/')
    const cards = wrapper.element.querySelectorAll('#services article')
    expect(cards).toHaveLength(siteConfig.services.length)
    expect(cards[0]?.textContent).toContain('Компьютерная диагностика')
    expect(cards[0]?.textContent).toMatch(/от 1\s500\s₽/)
    expect(wrapper.element.querySelectorAll('#services button')).toHaveLength(4)
  })

  it('прайс — таблица без кликабельных строк', async () => {
    const { wrapper } = await mountApp('/')
    const rows = wrapper.element.querySelectorAll('#prices tbody tr')
    expect(rows).toHaveLength(4)
    expect(wrapper.element.querySelector('#prices tr[tabindex]')).toBeNull()
    expect(wrapper.element.querySelector('#prices caption')?.textContent).toContain('Прайс-лист')
  })

  it('процесс — нумерованный список из четырёх шагов', async () => {
    const { wrapper } = await mountApp('/')
    expect(wrapper.element.querySelectorAll('#process ol > li')).toHaveLength(4)
  })

  it('FAQ: первый пункт раскрыт', async () => {
    const { wrapper } = await mountApp('/')
    const details = [
      ...(wrapper.element as HTMLElement).querySelectorAll<HTMLDetailsElement>('#faq details'),
    ]
    expect(details.map((d) => d.open)).toEqual([true, false, false, false])
  })

  it('контакты: телефон и email — ссылки; карта не грузится до клика', async () => {
    const { wrapper } = await mountApp('/')
    const contacts = wrapper.element.querySelector('#contacts') as HTMLElement
    expect(contacts.querySelector('a[href="tel:+70000000000"]')?.textContent).toBe(
      '+7 (000) 000-00-00',
    )
    expect(contacts.querySelector('a[href="mailto:hello@example.ru"]')).not.toBeNull()
    expect(contacts.querySelector('iframe')).toBeNull()
    const button = [...contacts.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Показать карту'),
    )
    button?.click()
    await flushPromises()
    const frame = contacts.querySelector('iframe')
    expect(frame?.getAttribute('src')).toContain('yandex.ru/map-widget')
    expect(frame?.getAttribute('title')).toBe('Карта проезда')
  })

  it('подвал: ссылки на политику и согласие, плашка «Демо-проект», год', async () => {
    const { wrapper } = await mountApp('/')
    const footer = wrapper.element.querySelector('footer') as HTMLElement
    expect(footer.querySelector('a[href="/privacy"]')).not.toBeNull()
    expect(footer.querySelector('a[href="/consent"]')).not.toBeNull()
    expect(footer.textContent).toContain('Демо-проект')
    expect(footer.textContent).toContain(String(new Date().getFullYear()))
  })

  it('первая в порядке табуляции — ссылка «Перейти к содержимому»', async () => {
    const { wrapper } = await mountApp('/')
    const first = wrapper.element.querySelector('a')
    expect(first?.getAttribute('href')).toBe('#content')
    expect(wrapper.element.querySelector('main#content')).not.toBeNull()
  })

  it('чекбокс согласия не отмечен, honeypot скрыт от скринридеров', async () => {
    const { wrapper } = await mountApp('/')
    await vi.waitFor(() =>
      expect(wrapper.element.querySelector('input[name="consent"]')).not.toBeNull(),
    )
    const consent = (wrapper.element as HTMLElement).querySelector<HTMLInputElement>(
      'input[name="consent"]',
    )
    expect(consent?.checked).toBe(false)
    const honeypot = wrapper.element.querySelector('input[name="website"]')
    expect(honeypot?.getAttribute('tabindex')).toBe('-1')
    expect(honeypot?.closest('[aria-hidden="true"]')).not.toBeNull()
  })

  it('доступна (axe)', async () => {
    const { wrapper } = await mountApp('/')
    await expectAccessible(wrapper.element)
  })
})

describe('SEO главной', () => {
  it('title, description, canonical и Open Graph', async () => {
    const { head } = await mountApp('/')
    await flushPromises()
    await new Promise((r) => setTimeout(r, 20))
    expect(document.title).toBe('Гараж 24 — ремонт и обслуживание автомобилей')
    const meta = (selector: string) =>
      document.head.querySelector(selector)?.getAttribute('content')
    expect(meta('meta[name="description"]')).toContain('Диагностика')
    expect(meta('meta[property="og:title"]')).toBe('Гараж 24 — ремонт и обслуживание автомобилей')
    expect(meta('meta[property="og:image"]')).toBe('https://example.ru/generated/og.png')
    expect(meta('meta[name="twitter:card"]')).toBe('summary_large_image')
    expect(document.head.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(
      'https://example.ru/',
    )
    expect(document.documentElement.getAttribute('lang')).toBe('ru')
    expect(head).toBeDefined()
  })

  it('JSON-LD: LocalBusiness и FAQPage', async () => {
    await mountApp('/')
    await new Promise((r) => setTimeout(r, 20))
    const blocks = [...document.head.querySelectorAll('script[type="application/ld+json"]')].map(
      (s) => JSON.parse(s.textContent ?? '{}'),
    )
    const types = blocks.map((b) => b['@type'])
    expect(types).toContain('AutoRepair')
    expect(types).toContain('FAQPage')
    const faq = blocks.find((b) => b['@type'] === 'FAQPage')
    expect(faq.mainEntity).toHaveLength(4)
    const business = blocks.find((b) => b['@type'] === 'AutoRepair')
    expect(business.telephone).toBe('+70000000000')
  })
})

describe('страницы', () => {
  it('политика: девять разделов, дата редакции, пометка о шаблоне', async () => {
    const { wrapper } = await mountApp('/privacy')
    expect(wrapper.element.querySelector('h1')?.textContent).toBe(
      'Политика обработки персональных данных',
    )
    expect(wrapper.element.querySelectorAll('main h2')).toHaveLength(9)
    expect(wrapper.element.textContent).toContain('Редакция от 20 октября 2026')
    expect(wrapper.element.textContent).toContain('шаблоном')
    await expectAccessible(wrapper.element)
  })

  it('согласие: текст из словаря и ссылка на политику', async () => {
    const { wrapper } = await mountApp('/consent')
    expect(wrapper.element.querySelector('h1')?.textContent).toBe(
      'Согласие на обработку персональных данных',
    )
    expect(wrapper.element.textContent).toContain(
      'Я даю согласие на обработку моих персональных данных',
    )
    expect(wrapper.element.querySelector('main a[href="/privacy"]')).not.toBeNull()
    await expectAccessible(wrapper.element)
  })

  it('404: заголовок, кнопка «На главную», noindex', async () => {
    const { wrapper } = await mountApp('/нет-такой-страницы')
    await new Promise((r) => setTimeout(r, 20))
    expect(wrapper.element.querySelector('h1')?.textContent).toBe('Страница не найдена')
    expect(wrapper.element.querySelector('main a[href="/"]')?.textContent).toContain('На главную')
    expect(document.head.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe(
      'noindex, nofollow',
    )
    await expectAccessible(wrapper.element)
  })

  it('/404 — отдельная страница для пререндера', async () => {
    const { wrapper } = await mountApp('/404')
    expect(wrapper.element.querySelector('h1')?.textContent).toBe('Страница не найдена')
  })
})
