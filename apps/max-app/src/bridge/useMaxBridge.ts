import { createRealBridge } from './realBridge'
import type { MaxBridge } from './types'

export type { ContactProof, MaxBridge, Platform } from './types'

let current: MaxBridge | null = null

/** Адаптер единственный: приложение не обращается к window.WebApp напрямую. */
export function useMaxBridge(): MaxBridge {
  current ??= createRealBridge(window.WebApp)
  return current
}

/** Подмена моста: демо-режим после ввода имени и тесты. */
export function setMaxBridge(bridge: MaxBridge | null): void {
  current = bridge
}
