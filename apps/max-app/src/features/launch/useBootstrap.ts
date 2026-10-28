import { ApiError, type components } from '@app/api-client'
import { type MessageKey, messages } from '@app/i18n'
import { useQuery } from '@tanstack/vue-query'
import { type Ref, inject, provide } from 'vue'

import { api } from '../../api'

export type Bootstrap = components['schemas']['Bootstrap']
export const BOOTSTRAP_KEY = ['bootstrap'] as const
const PROVIDED = Symbol('bootstrap')

export function useBootstrapQuery(enabled: Ref<boolean>) {
  return useQuery({
    queryKey: BOOTSTRAP_KEY,
    enabled,
    queryFn: async () => {
      const { data } = await api.GET('/api/v1/max/app/bootstrap')
      return data as Bootstrap
    },
  })
}

/** Данные бизнеса, услуг и настроек: доступны экранам только после прохождения шлюза запуска. */
export function provideBootstrap(data: Ref<Bootstrap>): void {
  provide(PROVIDED, data)
}

export function useBootstrap(): Ref<Bootstrap> {
  const data = inject<Ref<Bootstrap> | null>(PROVIDED, null)
  if (!data) throw new Error('useBootstrap вне шлюза запуска')
  return data
}

/** Сессия (initData) не подошла: повтор не поможет, нужно открыть приложение заново. */
export function isSessionError(error: unknown): error is ApiError {
  return error instanceof ApiError && error.status === 401
}

export function errorCode(error: unknown): string {
  if (error instanceof ApiError) return error.status === 0 ? 'network' : error.code
  return 'internal_error'
}

/** Текст ошибки API по коду; неизвестные коды — общее сообщение. */
export function errorMessage(code: string): MessageKey {
  return (
    code in messages.errors.api ? `errors.api.${code}` : 'errors.api.internal_error'
  ) as MessageKey
}
