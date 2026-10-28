import { createRealBridge } from './realBridge'
import type { MaxBridge } from './types'

/**
 * Имитация моста вне MAX (раздел 10.9 ТЗ): номер не запрашивается, haptic — no-op,
 * кнопка «Назад» рисуется самим приложением. Попадает в сборку только при VITE_DEMO=true.
 */
export function createDemoBridge(initData: string, firstName: string): MaxBridge {
  const base = createRealBridge(undefined)
  return {
    ...base,
    available: true,
    demo: true,
    initData,
    platform: 'web',
    userFirstName: firstName,
    requestContact: async () => null,
  }
}
