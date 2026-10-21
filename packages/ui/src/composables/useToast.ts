import type { MessageArgs, MessageKey } from '@app/i18n'
import { computed, ref } from 'vue'

export type ToastTone = 'success' | 'error' | 'info' | 'warning'

export interface ToastAction {
  label: MessageKey
  onClick: () => void
}

export interface ToastItem {
  id: number
  tone: ToastTone
  k: MessageKey
  args?: MessageArgs
  action?: ToastAction
  /** Через сколько мс скрыть. */
  duration: number
}

export interface ToastOptions {
  action?: ToastAction
  duration?: number
}

export const TOAST_DURATION_MS = 5000
export const TOAST_ERROR_DURATION_MS = 8000

const items = ref<ToastItem[]>([])
const visibleItems = computed<ToastItem[]>(() => items.value)
let nextId = 1

function push(
  tone: ToastTone,
  k: MessageKey,
  args?: MessageArgs,
  options: ToastOptions = {},
): number {
  const id = nextId++
  const item: ToastItem = {
    id,
    tone,
    k,
    duration: options.duration ?? (tone === 'error' ? TOAST_ERROR_DURATION_MS : TOAST_DURATION_MS),
    ...(args !== undefined ? { args } : {}),
    ...(options.action ? { action: options.action } : {}),
  }
  items.value = [...items.value, item]
  return id
}

function dismiss(id: number): void {
  items.value = items.value.filter((item) => item.id !== id)
}

function clear(): void {
  items.value = []
}

/** Глобальные уведомления; выводятся компонентом `ToastRegion`, смонтированным один раз. */
export function useToast() {
  return {
    items: visibleItems,
    success: (k: MessageKey, args?: MessageArgs, options?: ToastOptions) =>
      push('success', k, args, options),
    error: (k: MessageKey, args?: MessageArgs, options?: ToastOptions) =>
      push('error', k, args, options),
    info: (k: MessageKey, args?: MessageArgs, options?: ToastOptions) =>
      push('info', k, args, options),
    warning: (k: MessageKey, args?: MessageArgs, options?: ToastOptions) =>
      push('warning', k, args, options),
    dismiss,
    clear,
  }
}
