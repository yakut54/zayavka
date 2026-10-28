import { ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_URL } from './env'

const CSRF_COOKIE = 'csrf'

interface Session {
  cookie: string
  csrf: string
}

/** Вход администратора через API (без браузера): cookie сессии и CSRF-токен. */
export async function adminSession(): Promise<Session> {
  const response = await fetch(`${ADMIN_URL}/api/v1/admin/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: ADMIN_URL },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  })
  if (!response.ok) throw new Error(`вход администратора не удался: ${response.status}`)
  const cookies = response.headers.getSetCookie().map((line) => line.split(';')[0] ?? '')
  const csrf = cookies.find((c) => c.startsWith(`${CSRF_COOKIE}=`))?.split('=')[1]
  if (!csrf) throw new Error('нет CSRF-cookie после входа')
  return { cookie: cookies.join('; '), csrf }
}

export async function adminCall<T>(
  session: Session,
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const response = await fetch(`${ADMIN_URL}/api/v1/admin${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Origin: ADMIN_URL,
      Cookie: session.cookie,
      'X-CSRF-Token': session.csrf,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  if (!response.ok)
    throw new Error(`${method} ${path}: ${response.status} ${await response.text()}`)
  return (response.status === 204 ? undefined : await response.json()) as T
}

export const RESOURCE_NAME = 'Мастер E2E'
const WORKDAY: [number, number][] = [[540, 1140]] // 09:00–19:00

/** Сотрудник для сценариев записи: все услуги, график на все дни недели. Повторный вызов безопасен. */
export async function seedResource(): Promise<void> {
  const session = await adminSession()
  const existing = await adminCall<{ id: string; name: string }[]>(session, 'GET', '/resources')
  let resource = existing.find((item) => item.name === RESOURCE_NAME)
  resource ??= await adminCall<{ id: string; name: string }>(session, 'POST', '/resources', {
    name: RESOURCE_NAME,
    title: 'Тест',
    sort_order: 1,
  })
  await adminCall(session, 'PUT', `/resources/${resource.id}/services`, {
    service_slugs: ['diagnostics', 'maintenance', 'brakes', 'tires'],
  })
  await adminCall(session, 'PUT', `/resources/${resource.id}/working-hours`, {
    days: Object.fromEntries([1, 2, 3, 4, 5, 6, 7].map((day) => [day, WORKDAY])),
  })
}
