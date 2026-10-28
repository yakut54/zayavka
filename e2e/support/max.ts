import { createHmac } from 'node:crypto'

import type { Page } from '@playwright/test'

export const MINIAPP_URL = 'http://localhost:8082'
export const MAX_STUB_URL = 'http://localhost:19000'
export const BOT_TOKEN = 'e2e-bot-token-e2e-bot-token'

export interface StubRequest {
  method: string
  path: string
  query: Record<string, string>
  authorization: string | null
  body: { text?: string } | null
}

/** initData по алгоритму MAX: HMAC-SHA256 от отсортированных `key=value` ключом из токена бота. */
export function signInitData(
  user: { id: number; first_name: string },
  options: { startParam?: string; token?: string } = {},
): string {
  const fields: Record<string, string> = {
    auth_date: String(Math.floor(Date.now() / 1000)),
    query_id: `e2e-${user.id}`,
    user: JSON.stringify(user),
    ...(options.startParam ? { start_param: options.startParam } : {}),
  }
  const secret = createHmac('sha256', 'WebAppData')
    .update(options.token ?? BOT_TOKEN)
    .digest()
  const launch = Object.keys(fields)
    .sort()
    .map((key) => `${key}=${fields[key]}`)
    .join('\n')
  const hash = createHmac('sha256', secret).update(launch).digest('hex')
  return Object.entries({ ...fields, hash })
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join('&')
}

/** Подменяет мост MAX: вместо st.max.ru отдаётся скрипт, создающий window.WebApp. */
export async function installBridge(
  page: Page,
  user: { id: number; first_name: string },
  options: { platform?: string; phone?: string | null; startParam?: string } = {},
): Promise<void> {
  const initData = signInitData(user, options.startParam ? { startParam: options.startParam } : {})
  const script = `
    window.WebApp = {
      initData: ${JSON.stringify(initData)},
      initDataUnsafe: { user: ${JSON.stringify(user)}${options.startParam ? `, start_param: ${JSON.stringify(options.startParam)}` : ''} },
      platform: ${JSON.stringify(options.platform ?? 'android')},
      ready() {},
      BackButton: { show() {}, hide() {}, onClick() {}, offClick() {} },
      HapticFeedback: { selectionChanged() {}, notificationOccurred() {} },
      enableClosingConfirmation() {},
      disableClosingConfirmation() {},
      requestContact: () => Promise.reject({ error: { code: 'denied' } }),
      openLink(url) { window.__opened = url },
      openMaxLink(url) { window.__opened = url },
    }
  `
  await page.route('https://st.max.ru/**', (route) =>
    route.fulfill({ contentType: 'application/javascript', body: script }),
  )
}

export async function stubRequests(): Promise<StubRequest[]> {
  const response = await fetch(`${MAX_STUB_URL}/__requests`)
  return (await response.json()) as StubRequest[]
}

export async function clearStub(): Promise<void> {
  await fetch(`${MAX_STUB_URL}/__requests`, { method: 'DELETE' })
}

/** Сообщения бота данному пользователю (POST /messages?user_id=…). */
export async function messagesTo(userId: number): Promise<string[]> {
  return (await stubRequests())
    .filter(
      (r) => r.method === 'POST' && r.path === '/messages' && r.query.user_id === String(userId),
    )
    .map((r) => r.body?.text ?? '')
}
