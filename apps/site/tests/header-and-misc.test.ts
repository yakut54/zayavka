import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, nextTick } from 'vue'

import {
  analyticsConsent,
  initAnalytics,
  readStoredConsent,
  setConsent,
  trackGoal,
} from '../src/composables/useAnalytics'
import { useActiveSection } from '../src/composables/useActiveSection'
import { chooseService, scrollToLeadForm, selectedService } from '../src/composables/useLeadFormBus'
import siteConfig from '../site.config'
import { faqJsonLd, localBusinessJsonLd } from '../src/seo/jsonld'
import { expectAccessible, mountApp } from './helpers'

describe('шапка', () => {
  it('навигация-якоря, телефон, кнопка «Оставить заявку»', async () => {
    const { wrapper } = await mountApp('/')
    const nav = wrapper.find('nav[aria-label="Основная навигация"]')
    expect(nav.findAll('a').map((a) => a.text())).toEqual([
      'Услуги',
      'Цены',
      'Как мы работаем',
      'Вопросы',
      'Контакты',
    ])
    expect(nav.find('a').attributes('href')).toBe('/#services')
    const header = wrapper.find('header')
    expect(header.find('a[href="tel:+70000000000"]').text()).toBe('+7 (000) 000-00-00')
    expect(header.text()).toContain('Оставить заявку')
  })

  it('логотип — ссылка на главную с названием бренда', async () => {
    const { wrapper } = await mountApp('/')
    const logo = wrapper.find('header a[href="/"]')
    expect(logo.attributes('aria-label')).toBe('Гараж 24')
  })

  it('мобильное меню: кнопка с aria-expanded открывает Drawer, пункт закрывает', async () => {
    const { wrapper } = await mountApp('/')
    const burger = wrapper.find('button[aria-controls="mobile-menu"]')
    expect(burger.attributes('aria-expanded')).toBe('false')
    expect(wrapper.find('dialog').exists()).toBe(false)

    await burger.trigger('click')
    await vi.waitFor(() => expect(wrapper.find('dialog').exists()).toBe(true))
    expect(burger.attributes('aria-expanded')).toBe('true')
    const dialog = wrapper.find('dialog')
    expect((dialog.element as HTMLDialogElement).open).toBe(true)
    expect(dialog.text()).toContain('Услуги')
    expect(dialog.find('a[href="tel:+70000000000"]').exists()).toBe(true)

    await dialog.find('nav a').trigger('click')
    await flushPromises()
    expect(wrapper.find('button[aria-controls="mobile-menu"]').attributes('aria-expanded')).toBe(
      'false',
    )
  })

  it('мобильное меню: Esc и крестик закрывают', async () => {
    const { wrapper } = await mountApp('/')
    await wrapper.find('button[aria-controls="mobile-menu"]').trigger('click')
    await vi.waitFor(() => expect(wrapper.find('dialog').exists()).toBe(true))
    wrapper.find('dialog').element.dispatchEvent(new Event('cancel', { cancelable: true }))
    await flushPromises()
    expect(wrapper.find('button[aria-controls="mobile-menu"]').attributes('aria-expanded')).toBe(
      'false',
    )
  })

  it('мобильное меню: кнопка «Оставить заявку» закрывает меню и прокручивает к форме', async () => {
    const { wrapper } = await mountApp('/')
    const scroll = vi.fn()
    Element.prototype.scrollIntoView = scroll
    await wrapper.find('button[aria-controls="mobile-menu"]').trigger('click')
    await vi.waitFor(() => expect(wrapper.find('dialog').exists()).toBe(true))
    const cta = wrapper.findAll('dialog button').find((b) => b.text() === 'Оставить заявку')
    await cta?.trigger('click')
    await flushPromises()
    expect(scroll).toHaveBeenCalled()
  })

  it('CTA на главной прокручивает к форме и ставит фокус на «Имя»', async () => {
    const { wrapper } = await mountApp('/')
    await vi.waitFor(() => expect(wrapper.find('input[name="name"]').exists()).toBe(true))
    const scroll = vi.fn()
    Element.prototype.scrollIntoView = scroll
    const cta = wrapper.findAll('header button').find((b) => b.text() === 'Оставить заявку')
    await cta?.trigger('click')
    expect(scroll).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' })
    expect(document.activeElement).toBe(wrapper.find('input[name="name"]').element)
  })

  it('CTA на другой странице ведёт на главную к форме', async () => {
    const { wrapper, router } = await mountApp('/privacy')
    const cta = wrapper.findAll('header button').find((b) => b.text() === 'Оставить заявку')
    await cta?.trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/')
    expect(router.currentRoute.value.hash).toBe('#lead-form')
  })

  it('тень шапки после прокрутки на 8 px', async () => {
    const { wrapper } = await mountApp('/')
    expect(wrapper.find('header').classes()).not.toContain('site-header--scrolled')
    Object.defineProperty(window, 'scrollY', { value: 20, configurable: true })
    window.dispatchEvent(new Event('scroll'))
    await nextTick()
    expect(wrapper.find('header').classes()).toContain('site-header--scrolled')
    Object.defineProperty(window, 'scrollY', { value: 0, configurable: true })
  })

  it('доступна', async () => {
    const { wrapper } = await mountApp('/')
    await expectAccessible(wrapper.find('header').element)
  })
})

describe('форма: шина данных', () => {
  it('chooseService запоминает услугу и прокручивает к форме', async () => {
    document.body.innerHTML = '<section id="lead-form"><input name="name" /></section>'
    const scroll = vi.fn()
    Element.prototype.scrollIntoView = scroll
    chooseService('tires')
    expect(selectedService.value).toBe('tires')
    expect(scroll).toHaveBeenCalled()
    expect(document.activeElement?.getAttribute('name')).toBe('name')
  })

  it('scrollToLeadForm без формы на странице ничего не делает', () => {
    document.body.innerHTML = ''
    expect(() => scrollToLeadForm()).not.toThrow()
  })

  it('при prefers-reduced-motion прокрутка без анимации', () => {
    document.body.innerHTML = '<section id="lead-form"></section>'
    const scroll = vi.fn()
    Element.prototype.scrollIntoView = scroll
    vi.stubGlobal('matchMedia', () => ({ matches: true }))
    scrollToLeadForm()
    expect(scroll).toHaveBeenCalledWith({ behavior: 'auto', block: 'start' })
    vi.unstubAllGlobals()
  })
})

describe('аналитика', () => {
  beforeEach(() => {
    window.localStorage.clear()
    analyticsConsent.value = null
    document.head.querySelectorAll('script[data-metrika]').forEach((s) => s.remove())
    window.ym = undefined
  })
  afterEach(() => vi.restoreAllMocks())

  it('без идентификатора ничего не происходит', () => {
    initAnalytics(null)
    expect(analyticsConsent.value).toBeNull()
    setConsent('granted')
    expect(document.head.querySelector('script[data-metrika]')).toBeNull()
  })

  it('до согласия скрипт не загружается', () => {
    initAnalytics('12345')
    expect(analyticsConsent.value).toBeNull()
    expect(document.head.querySelector('script[data-metrika]')).toBeNull()
  })

  it('согласие загружает скрипт и запоминается', () => {
    initAnalytics('12345')
    setConsent('granted')
    expect(document.head.querySelector('script[data-metrika]')?.getAttribute('src')).toContain(
      'mc.yandex.ru',
    )
    expect(readStoredConsent()).toBe('granted')
  })

  it('отказ не загружает скрипт', () => {
    initAnalytics('12345')
    setConsent('denied')
    expect(document.head.querySelector('script[data-metrika]')).toBeNull()
    expect(readStoredConsent()).toBe('denied')
  })

  it('сохранённое согласие подхватывается при старте, повторно скрипт не добавляется', () => {
    window.localStorage.setItem('analytics-consent', 'granted')
    initAnalytics('12345')
    initAnalytics('12345')
    expect(document.head.querySelectorAll('script[data-metrika]')).toHaveLength(1)
  })

  it('цель отправляется только при согласии', () => {
    const ym = vi.fn()
    window.ym = ym
    initAnalytics('12345')
    trackGoal('lead_submitted')
    expect(ym).not.toHaveBeenCalled()
    setConsent('granted')
    trackGoal('lead_submitted')
    expect(ym).toHaveBeenCalledWith(12345, 'reachGoal', 'lead_submitted')
  })

  it('недоступный localStorage не ломает работу', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(readStoredConsent()).toBeNull()
    initAnalytics('12345')
    expect(() => setConsent('denied')).not.toThrow()
    expect(analyticsConsent.value).toBe('denied')
  })

  it('мусор в localStorage игнорируется', () => {
    window.localStorage.setItem('analytics-consent', 'maybe')
    expect(readStoredConsent()).toBeNull()
  })
})

describe('баннер cookie', () => {
  it('на сайте без аналитики баннера нет', async () => {
    const { wrapper } = await mountApp('/')
    expect(wrapper.find('aside.cookie').exists()).toBe(false)
  })

  it('с аналитикой: две равнозначные кнопки, выбор скрывает баннер', async () => {
    const original = siteConfig.analytics.yandexMetrikaId
    siteConfig.analytics.yandexMetrikaId = '12345'
    try {
      window.localStorage.clear()
      analyticsConsent.value = null
      const { wrapper } = await mountApp('/')
      const banner = wrapper.find('aside.cookie')
      expect(banner.exists()).toBe(true)
      const buttons = banner.findAll('button')
      expect(buttons.map((b) => b.text())).toEqual(['Принять', 'Отклонить'])
      expect(buttons[0]?.classes()).toEqual(buttons[1]?.classes())
      await buttons[1]?.trigger('click')
      expect(wrapper.find('aside.cookie').exists()).toBe(false)
    } finally {
      siteConfig.analytics.yandexMetrikaId = original
    }
  })
})

describe('useActiveSection', () => {
  it('подсвечивает секцию, пересекающую окно просмотра', async () => {
    document.body.innerHTML = '<div id="a"></div><div id="b"></div>'
    let callback: IntersectionObserverCallback = () => undefined
    const observed: string[] = []
    const disconnect = vi.fn()
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(cb: IntersectionObserverCallback) {
          callback = cb
        }
        observe(el: Element) {
          observed.push(el.id)
        }
        disconnect = disconnect
      },
    )
    let active: ReturnType<typeof useActiveSection> | undefined
    const Comp = defineComponent({
      setup() {
        active = useActiveSection(['a', 'b', 'missing'])
        return () => h('div')
      },
    })
    const app = createApp(Comp)
    app.mount(document.createElement('div'))
    expect(observed).toEqual(['a', 'b'])
    callback(
      [
        {
          isIntersecting: true,
          target: document.getElementById('b'),
        } as unknown as IntersectionObserverEntry,
      ],
      {} as IntersectionObserver,
    )
    callback(
      [
        {
          isIntersecting: false,
          target: document.getElementById('a'),
        } as unknown as IntersectionObserverEntry,
      ],
      {} as IntersectionObserver,
    )
    expect(active?.value).toBe('b')
    app.unmount()
    expect(disconnect).toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it('без IntersectionObserver не падает', () => {
    vi.stubGlobal('IntersectionObserver', undefined)
    delete (window as { IntersectionObserver?: unknown }).IntersectionObserver
    const Comp = defineComponent({
      setup() {
        useActiveSection(['a'])
        return () => h('div')
      },
    })
    expect(() => createApp(Comp).mount(document.createElement('div'))).not.toThrow()
    vi.unstubAllGlobals()
  })
})

describe('JSON-LD', () => {
  it('LocalBusiness: данные из конфига', () => {
    const data = localBusinessJsonLd(siteConfig)
    expect(data).toMatchObject({
      '@type': 'AutoRepair',
      name: 'Гараж 24',
      telephone: '+70000000000',
      email: 'hello@example.ru',
    })
  })

  it('FAQPage: вопросы из конфига', () => {
    const data = faqJsonLd(siteConfig) as { mainEntity: { name: string }[] }
    expect(data.mainEntity.map((q) => q.name)).toContain('Сколько длится диагностика?')
  })
})
