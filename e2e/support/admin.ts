import { execFileSync } from 'node:child_process'

import type { APIRequestContext, Page } from '@playwright/test'

import { ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_URL, COMPOSE, SITE_URL } from './env'

export async function loginAs(
  page: Page,
  email = ADMIN_EMAIL,
  password = ADMIN_PASSWORD,
): Promise<void> {
  await page.goto(`${ADMIN_URL}/login`)
  await page.locator('input[name="email"]').fill(email)
  await page.locator('input[name="password"]').fill(password)
  await page.getByRole('button', { name: 'Войти' }).click()
}

/** Вход с ожиданием перехода к заявкам: последующий goto не должен прервать запрос входа. */
export async function signIn(
  page: Page,
  email = ADMIN_EMAIL,
  password = ADMIN_PASSWORD,
): Promise<void> {
  await loginAs(page, email, password)
  await page.waitForURL(/\/leads/)
}

export interface CreatedLead {
  number: number
  name: string
  phone: string
}

let counter = 0

/** Заявка напрямую через API: elapsed_ms ≥ 3 с, чтобы сервер не принял её за бота. */
export async function createLead(
  request: APIRequestContext,
  overrides: { name?: string; phone?: string; service?: string; message?: string } = {},
): Promise<CreatedLead> {
  counter += 1
  const name = overrides.name ?? `Клиент ${Date.now()}-${counter}`
  const phone = overrides.phone ?? '+79990001122'
  const response = await request.post(`${SITE_URL}/api/v1/public/leads`, {
    data: {
      name,
      phone,
      email: null,
      message: overrides.message ?? null,
      service_slug: overrides.service ?? null,
      consent: true,
      policy_version: '2026-10-20',
      utm: {},
      website: '',
      elapsed_ms: 5000,
    },
  })
  if (response.status() !== 201) throw new Error(`lead not created: ${response.status()}`)
  const body = (await response.json()) as { public_number: number }
  return { number: body.public_number, name, phone }
}

/** Отдельный администратор для тестов, меняющих пароль или завершающих сессии. */
export function createAdmin(email: string, password: string): void {
  try {
    execFileSync(
      'docker',
      [
        ...COMPOSE,
        'exec',
        '-T',
        'api',
        'python',
        '-m',
        'app.cli',
        'create-admin',
        '--email',
        email,
        '--stdin',
      ],
      { input: `${password}\n`, stdio: ['pipe', 'pipe', 'pipe'] },
    )
  } catch (error) {
    const stderr = String((error as { stderr?: Buffer }).stderr ?? '')
    if (!stderr.includes('уже существует')) throw error
  }
}
