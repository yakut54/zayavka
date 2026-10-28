import { afterEach, describe, expect, it } from 'vitest'

import siteConfig from '../site.config'
import { buildMaxBotLink, serviceStartParam } from '../src/composables/maxLink'
import { mountApp } from './helpers'

afterEach(() => {
  siteConfig.max.bookingEnabled = false
})

describe('ссылки на бота', () => {
  it('ссылка и параметр запуска s_<slug>', () => {
    expect(buildMaxBotLink()).toBe('https://max.ru/example_bot')
    expect(buildMaxBotLink(serviceStartParam('tires'))).toBe(
      'https://max.ru/example_bot?startapp=s_tires',
    )
  })
})

describe('кнопки записи на лендинге (раздел 10.8 ТЗ-2)', () => {
  it('выключено: «Позвонить» и «Выбрать», ссылок на бота нет', async () => {
    const { wrapper } = await mountApp('/')
    expect(wrapper.text()).toContain('Позвонить')
    expect(wrapper.text()).not.toContain('Записаться онлайн')
    expect(wrapper.find('a[href^="https://max.ru"]').exists()).toBe(false)
  })

  it('включено: у героя «Записаться онлайн», у услуг — «Записаться» со startapp', async () => {
    siteConfig.max.bookingEnabled = true
    const { wrapper } = await mountApp('/')
    const hero = wrapper.find('#hero-title').element.closest('section') as HTMLElement
    expect(hero.querySelector('a[href="https://max.ru/example_bot"]')?.textContent).toContain(
      'Записаться онлайн',
    )
    const links = [...wrapper.element.querySelectorAll('#services a[href*="startapp="]')]
    const bookable = siteConfig.services.filter((s) => s.bookable)
    expect(links.map((a) => a.getAttribute('href'))).toEqual(
      bookable.map((s) => `https://max.ru/example_bot?startapp=s_${s.slug}`),
    )
    // «Оставить заявку» и «Выбрать» остаются
    expect(wrapper.text()).toContain('Оставить заявку')
    expect(wrapper.element.querySelectorAll('#services button')).toHaveLength(
      siteConfig.services.length,
    )
  })
})
