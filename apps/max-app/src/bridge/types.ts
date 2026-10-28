import type { components } from '@app/api-client'

export type ContactProof = components['schemas']['ContactProof']
export type Platform = 'ios' | 'android' | 'desktop' | 'web' | 'unknown'

/** Единственная точка доступа к мосту MAX (раздел 10.3 ТЗ). */
export interface MaxBridge {
  /** window.WebApp есть и initData не пустой. */
  readonly available: boolean
  /** Демо-режим вне MAX (раздел 10.9). */
  readonly demo: boolean
  readonly initData: string
  readonly platform: Platform
  readonly startParam: string | null
  readonly userFirstName: string | null
  /** null — отказ или недоступно. */
  requestContact(): Promise<ContactProof | null>
  backButton: {
    show(): void
    hide(): void
    /** Возвращает функцию отписки. */
    onClick(cb: () => void): () => void
  }
  closingConfirmation(enabled: boolean): void
  haptic: { selection(): void; success(): void; error(): void }
  /** Внешние ссылки — openLink, max.ru — openMaxLink. */
  openLink(url: string): void
  /** false — не поддерживается. */
  downloadFile(url: string, name: string): Promise<boolean>
}
