import { defineStore } from 'pinia'
import { ref } from 'vue'

export type Theme = 'light' | 'dark'
const STORAGE_KEY = 'admin-theme'

function readStored(): Theme | null {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY)
    return value === 'light' || value === 'dark' ? value : null
  } catch {
    return null
  }
}

function systemTheme(): Theme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

/** Только UI-состояние: тема. Всё, что приходит с сервера, живёт в vue-query. */
export const useUiStore = defineStore('ui', () => {
  const theme = ref<Theme>('light')

  function apply(value: Theme): void {
    theme.value = value
    document.documentElement.dataset.theme = value
  }

  /** Светлая/тёмная по prefers-color-scheme, выбор пользователя запоминается. */
  function init(): void {
    apply(readStored() ?? systemTheme())
  }

  function toggle(): void {
    const next: Theme = theme.value === 'dark' ? 'light' : 'dark'
    apply(next)
    try {
      window.localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // хранилище недоступно — тема действует до перезагрузки
    }
  }

  return { theme, init, toggle }
})
