/** Часть API `window.WebApp` (st.max.ru/js/max-web-app.js), которой пользуется адаптер. */
export interface WebAppApi {
  initData?: string
  initDataUnsafe?: { start_param?: string; user?: { first_name?: string } }
  platform?: string
  ready?: () => void
  BackButton?: {
    show(): void
    hide(): void
    onClick(cb: () => void): void
    offClick(cb: () => void): void
  }
  HapticFeedback?: {
    selectionChanged(): void
    notificationOccurred(type: 'success' | 'error' | 'warning'): void
  }
  enableClosingConfirmation?: () => void
  disableClosingConfirmation?: () => void
  requestContact?: () => Promise<{ phone: string; authDate: string; hash: string }>
  openLink?: (url: string) => void
  openMaxLink?: (url: string) => void
  downloadFile?: (url: string, fileName: string) => Promise<unknown>
}

declare global {
  interface Window {
    WebApp?: WebAppApi
  }
}
