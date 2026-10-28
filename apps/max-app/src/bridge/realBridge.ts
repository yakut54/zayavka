import type { ContactProof, MaxBridge, Platform } from './types'
import type { WebAppApi } from './webapp'

const PLATFORMS: readonly Platform[] = ['ios', 'android', 'desktop', 'web']

/** Отказ любого вызова моста — «недоступно», а не падение интерфейса. */
function safe<T>(fallback: T, call: () => T): T {
  try {
    return call()
  } catch (error) {
    if (import.meta.env.DEV) console.warn('[max-bridge]', error)
    return fallback
  }
}

async function safeAsync<T>(fallback: T, call: () => Promise<T>): Promise<T> {
  try {
    return await call()
  } catch (error) {
    if (import.meta.env.DEV) console.warn('[max-bridge]', error)
    return fallback
  }
}

export function detectPlatform(value: string | undefined): Platform {
  return PLATFORMS.find((item) => item === value) ?? 'unknown'
}

const MAX_LINK = /^https:\/\/(?:[a-z0-9-]+\.)?max\.ru(?:[/?#]|$)/i

export function createRealBridge(app: WebAppApi | undefined): MaxBridge {
  const initData = app?.initData ?? ''
  const platform = detectPlatform(app?.platform)
  const unsafe = app?.initDataUnsafe
  // Колбэки хранятся, чтобы offClick получал ту же ссылку (требование документации).
  const handlers = new Set<() => void>()

  return {
    available: Boolean(app) && initData !== '',
    demo: false,
    initData,
    platform,
    startParam: unsafe?.start_param ?? null,
    userFirstName: unsafe?.user?.first_name ?? null,
    async requestContact(): Promise<ContactProof | null> {
      const request = app?.requestContact
      if (!request) return null
      return safeAsync<ContactProof | null>(null, async () => {
        const result = await request.call(app)
        return result?.phone && result.authDate && result.hash
          ? { phone: result.phone, authDate: result.authDate, hash: result.hash }
          : null
      })
    },
    backButton: {
      show: () => safe(undefined, () => app?.BackButton?.show()),
      hide: () => safe(undefined, () => app?.BackButton?.hide()),
      onClick(cb) {
        handlers.add(cb)
        safe(undefined, () => app?.BackButton?.onClick(cb))
        return () => {
          handlers.delete(cb)
          safe(undefined, () => app?.BackButton?.offClick(cb))
        }
      },
    },
    closingConfirmation(enabled) {
      safe(undefined, () =>
        enabled ? app?.enableClosingConfirmation?.() : app?.disableClosingConfirmation?.(),
      )
    },
    haptic: {
      selection: () => safe(undefined, () => app?.HapticFeedback?.selectionChanged()),
      success: () => safe(undefined, () => app?.HapticFeedback?.notificationOccurred('success')),
      error: () => safe(undefined, () => app?.HapticFeedback?.notificationOccurred('error')),
    },
    openLink(url) {
      safe(undefined, () => {
        if (MAX_LINK.test(url) && app?.openMaxLink) app.openMaxLink(url)
        else if (app?.openLink) app.openLink(url)
        else window.open(url, '_blank', 'noopener')
      })
    },
    async downloadFile(url, name) {
      const download = app?.downloadFile
      if (!download || (platform !== 'ios' && platform !== 'android')) return false
      return safeAsync(false, async () => {
        await download.call(app, url, name)
        return true
      })
    },
  }
}
