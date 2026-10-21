const FALLBACK = '/leads'
const BACKSLASH = String.fromCharCode(92)

/**
 * Параметр `next` принимается только как относительный путь внутри админки
 * (защита от открытого редиректа, ТЗ-1 §13.1).
 */
export function safeNext(value: unknown): string {
  if (typeof value !== 'string') return FALLBACK
  if (!value.startsWith('/') || value.startsWith('//') || value.includes(BACKSLASH)) return FALLBACK
  if (/^\/+[a-z][a-z0-9+.-]*:/i.test(value)) return FALLBACK
  if (value === '/login' || value.startsWith('/login?')) return FALLBACK
  return value
}
