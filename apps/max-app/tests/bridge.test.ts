import { describe, expect, it, vi } from 'vitest'

import { createDemoBridge } from '../src/bridge/demoBridge'
import { createRealBridge, detectPlatform } from '../src/bridge/realBridge'
import type { WebAppApi } from '../src/bridge/webapp'

function fakeApp(overrides: Partial<WebAppApi> = {}): WebAppApi {
  return {
    initData: 'query_id=1&hash=x',
    platform: 'ios',
    initDataUnsafe: { start_param: 's_tires', user: { first_name: 'Анна' } },
    BackButton: { show: vi.fn(), hide: vi.fn(), onClick: vi.fn(), offClick: vi.fn() },
    HapticFeedback: { selectionChanged: vi.fn(), notificationOccurred: vi.fn() },
    enableClosingConfirmation: vi.fn(),
    disableClosingConfirmation: vi.fn(),
    openLink: vi.fn(),
    openMaxLink: vi.fn(),
    ...overrides,
  }
}

describe('createRealBridge', () => {
  it('читает данные запуска', () => {
    const bridge = createRealBridge(fakeApp())
    expect(bridge).toMatchObject({
      available: true,
      demo: false,
      platform: 'ios',
      startParam: 's_tires',
      userFirstName: 'Анна',
    })
  })

  it('без WebApp или без initData мост недоступен', () => {
    expect(createRealBridge(undefined).available).toBe(false)
    expect(createRealBridge(fakeApp({ initData: '' })).available).toBe(false)
    expect(createRealBridge(undefined)).toMatchObject({
      platform: 'unknown',
      startParam: null,
      userFirstName: null,
    })
  })

  it('неизвестная платформа → unknown', () => {
    expect(detectPlatform('desktop')).toBe('desktop')
    expect(detectPlatform('tizen')).toBe('unknown')
    expect(detectPlatform(undefined)).toBe('unknown')
  })

  it('отписка от «Назад» передаёт ту же ссылку на колбэк', () => {
    const app = fakeApp()
    const bridge = createRealBridge(app)
    const cb = vi.fn()
    const off = bridge.backButton.onClick(cb)
    expect(app.BackButton?.onClick).toHaveBeenCalledWith(cb)
    off()
    expect(app.BackButton?.offClick).toHaveBeenCalledWith(cb)
    bridge.backButton.show()
    bridge.backButton.hide()
    expect(app.BackButton?.show).toHaveBeenCalled()
    expect(app.BackButton?.hide).toHaveBeenCalled()
  })

  it('подтверждение закрытия и haptic вызывают методы моста', () => {
    const app = fakeApp()
    const bridge = createRealBridge(app)
    bridge.closingConfirmation(true)
    bridge.closingConfirmation(false)
    bridge.haptic.selection()
    bridge.haptic.success()
    bridge.haptic.error()
    expect(app.enableClosingConfirmation).toHaveBeenCalledOnce()
    expect(app.disableClosingConfirmation).toHaveBeenCalledOnce()
    expect(app.HapticFeedback?.selectionChanged).toHaveBeenCalledOnce()
    expect(app.HapticFeedback?.notificationOccurred).toHaveBeenCalledWith('success')
    expect(app.HapticFeedback?.notificationOccurred).toHaveBeenCalledWith('error')
  })

  it('исключение метода моста не роняет интерфейс', () => {
    const fail = (): never => {
      throw new Error('нет')
    }
    const bridge = createRealBridge(
      fakeApp({ HapticFeedback: { selectionChanged: fail, notificationOccurred: fail } }),
    )
    expect(() => bridge.haptic.selection()).not.toThrow()
    expect(() => bridge.haptic.error()).not.toThrow()
  })

  it('без методов на платформе — no-op', () => {
    const bridge = createRealBridge({ initData: 'x' })
    expect(() => {
      bridge.backButton.show()
      bridge.backButton.onClick(() => undefined)()
      bridge.haptic.success()
      bridge.closingConfirmation(true)
    }).not.toThrow()
  })

  it('requestContact: успех, отказ, пустой ответ и отсутствие метода', async () => {
    const proof = { phone: '79990001122', authDate: '1', hash: 'h' }
    const ok = fakeApp({ requestContact: async () => proof })
    expect(await createRealBridge(ok).requestContact()).toEqual(proof)
    const refused = fakeApp({ requestContact: () => Promise.reject({ error: { code: 'x' } }) })
    expect(await createRealBridge(refused).requestContact()).toBeNull()
    expect(await createRealBridge(fakeApp()).requestContact()).toBeNull()
    const empty = fakeApp({ requestContact: async () => ({ phone: '', authDate: '', hash: '' }) })
    expect(await createRealBridge(empty).requestContact()).toBeNull()
  })

  it('openLink: max.ru → openMaxLink, внешние → openLink, без моста — window.open', () => {
    const app = fakeApp()
    const bridge = createRealBridge(app)
    bridge.openLink('https://max.ru/bot')
    bridge.openLink('https://example.ru/privacy')
    bridge.openLink('https://evilmax.ru/')
    expect(app.openMaxLink).toHaveBeenCalledWith('https://max.ru/bot')
    expect(app.openLink).toHaveBeenCalledWith('https://example.ru/privacy')
    expect(app.openLink).toHaveBeenCalledWith('https://evilmax.ru/')

    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    createRealBridge(undefined).openLink('tel:+70000000000')
    expect(open).toHaveBeenCalledWith('tel:+70000000000', '_blank', 'noopener')
    open.mockRestore()
  })

  it('downloadFile: только ios/android и только если метод есть', async () => {
    const download = vi.fn().mockResolvedValue(undefined)
    const mobile = createRealBridge(fakeApp({ downloadFile: download }))
    expect(await mobile.downloadFile('/a', 'a.ics')).toBe(true)
    expect(download).toHaveBeenCalledWith('/a', 'a.ics')
    const web = createRealBridge(fakeApp({ platform: 'web', downloadFile: download }))
    expect(await web.downloadFile('/a', 'a.ics')).toBe(false)
    expect(await createRealBridge(fakeApp()).downloadFile('/a', 'a.ics')).toBe(false)
    const failing = fakeApp({ downloadFile: () => Promise.reject(new Error('нет')) })
    expect(await createRealBridge(failing).downloadFile('/a', 'a.ics')).toBe(false)
  })
})

describe('createDemoBridge', () => {
  it('доступен, помечен демо, номер не запрашивает', async () => {
    const bridge = createDemoBridge('init', 'Олег')
    expect(bridge).toMatchObject({
      available: true,
      demo: true,
      initData: 'init',
      platform: 'web',
      userFirstName: 'Олег',
    })
    expect(await bridge.requestContact()).toBeNull()
    expect(await bridge.downloadFile('/a', 'a.ics')).toBe(false)
  })
})
