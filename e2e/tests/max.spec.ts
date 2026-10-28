import AxeBuilder from '@axe-core/playwright'
import { type BrowserContext, type Page, expect, test } from '@playwright/test'

import { waitForMail } from '../support/mailpit'
import { MINIAPP_URL, clearStub, installBridge, messagesTo } from '../support/max'
import { adminCall, adminSession } from '../support/seed'

test.use({ baseURL: MINIAPP_URL })

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']
const uniqueId = (): number => 700_000 + Math.floor(Math.random() * 200_000)

async function expectNoViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze()
  expect(
    results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`),
  ).toEqual([])
}

/** После выбора услуги: если сотрудников несколько, шаг «Специалист» проходим выбором «любой». */
async function afterService(page: Page, resource = 'Любой свободный'): Promise<void> {
  const heading = page.getByRole('heading', { name: /Выберите (дату|специалиста)/ })
  await heading.waitFor()
  if ((await heading.innerText()).includes('специалиста')) {
    await page.locator('label.ui-card-select').filter({ hasText: resource }).click()
    await page.getByRole('heading', { name: 'Выберите дату' }).waitFor()
  }
}

async function openAs(page: Page, id: number, name = 'Анна'): Promise<void> {
  await installBridge(page, { id, first_name: name })
  await page.goto('/')
}

/** Услуга → (специалист пропускается: он один) → день по порядку → первое свободное время. */
async function pickSlot(page: Page, dayIndex: number, resource?: string): Promise<void> {
  await page.locator('label.ui-card-select').filter({ hasText: 'Компьютерная диагностика' }).click()
  await afterService(page, resource)
  const days = page.locator('[role="option"]:not([aria-disabled="true"])')
  await days.nth(dayIndex).click()
  await page
    .getByRole('radio', { name: /^\d{2}:\d{2}$/ })
    .first()
    .click()
  await page.getByRole('button', { name: /^Далее: / }).click()
}

async function fillContacts(page: Page): Promise<void> {
  await page.getByRole('textbox', { name: /Телефон/ }).pressSequentially('9991234567')
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Далее', exact: true }).click()
}

/** Полная запись; возвращает номер из экрана успеха. */
async function book(page: Page, dayIndex: number): Promise<number> {
  await pickSlot(page, dayIndex)
  await fillContacts(page)
  await page.getByRole('button', { name: 'Записаться' }).click()
  await expect(page.getByRole('heading', { name: 'Вы записаны' })).toBeVisible()
  const text = await page.getByText(/^Запись № \d+$/).innerText()
  return Number(text.replace(/\D/g, ''))
}

test.beforeEach(async () => {
  await clearStub()
})

test('1. Запись: сообщение в чат и письмо владельцу', async ({ page }) => {
  const id = uniqueId()
  await openAs(page, id)
  const number = await book(page, 1)
  await expect
    .poll(() => messagesTo(id), { timeout: 30_000 })
    .toContainEqual(expect.stringContaining('Вы записаны'))
  await waitForMail(`Новая запись № ${number}`)
})

test('2. Гонка: второй клиент получает «время заняли» и обновлённый список', async ({
  browser,
}) => {
  const open = async (): Promise<{ page: Page; context: BrowserContext }> => {
    const context = await browser.newContext({ baseURL: MINIAPP_URL, locale: 'ru-RU' })
    const page = await context.newPage()
    await openAs(page, uniqueId())
    return { page, context }
  }
  const first = await open()
  const second = await open()
  await pickSlot(first.page, 2, 'Мастер E2E')
  await pickSlot(second.page, 2, 'Мастер E2E')
  await fillContacts(first.page)
  await fillContacts(second.page)
  await first.page.getByRole('button', { name: 'Записаться' }).click()
  await expect(first.page.getByRole('heading', { name: 'Вы записаны' })).toBeVisible()
  await second.page.getByRole('button', { name: 'Записаться' }).click()
  await expect(second.page.getByText('Это время только что заняли')).toBeVisible()
  await expect(second.page.getByRole('heading', { name: 'Выберите время' })).toBeVisible()
  await first.context.close()
  await second.context.close()
})

test('3. Отмена из «Моих записей»: статус и письмо владельцу', async ({ page }) => {
  await openAs(page, uniqueId())
  const number = await book(page, 3)
  await page.getByRole('button', { name: 'Мои записи' }).click()
  await page.getByRole('button', { name: 'Отменить', exact: true }).click()
  await page.getByRole('button', { name: 'Отменить запись' }).click()
  await expect(page.getByText('Запись отменена')).toBeVisible()
  await page.getByRole('tab', { name: 'Прошедшие' }).click()
  await expect(page.getByText('Отменена вами')).toBeVisible()
  await waitForMail(`Отмена записи № ${number}`)
})

test('4. Перенос: старая запись «Перенесена», новая предстоящая', async ({ page }) => {
  await openAs(page, uniqueId())
  await book(page, 4)
  await page.getByRole('button', { name: 'Мои записи' }).click()
  await page.getByRole('button', { name: 'Перенести' }).click()
  await page.locator('[role="option"]:not([aria-disabled="true"])').nth(5).click()
  await page
    .getByRole('radio', { name: /^\d{2}:\d{2}$/ })
    .first()
    .click()
  await page.getByRole('button', { name: /^Далее: / }).click()
  await page.getByRole('button', { name: 'Записаться' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Перенести' }).click()
  await expect(page.getByRole('heading', { name: 'Вы записаны' })).toBeVisible()
  await page.getByRole('button', { name: 'Мои записи' }).click()
  await expect(page.getByRole('button', { name: 'Перенести' })).toHaveCount(1)
  await page.getByRole('tab', { name: 'Прошедшие' }).click()
  await expect(page.getByText('Перенесена')).toBeVisible()
})

test('5. Нет времени → заявка видна в админке с источником MAX', async ({ page }) => {
  await page.route('**/availability/days*', async (route) => {
    const from = new URL(route.request().url()).searchParams.get('from')
    await route.fulfill({ json: [{ date: from, available: false }] })
  })
  const id = uniqueId()
  await openAs(page, id, 'Заявитель')
  await page.locator('label.ui-card-select').filter({ hasText: 'Компьютерная диагностика' }).click()
  await afterService(page)
  await expect(page.getByText('Свободного времени нет')).toBeVisible()
  await page.getByRole('link', { name: 'Оставить заявку' }).click()
  await page.getByRole('textbox', { name: /Телефон/ }).pressSequentially('9990001122')
  await page.getByRole('checkbox').check()
  // быстрее ~3 с сервер считает отправку ботом и заявку не сохраняет (honeypot по elapsed_ms)
  await page.waitForTimeout(3_200)
  await page.getByRole('button', { name: 'Отправить заявку' }).click()
  const title = await page.getByRole('heading', { name: /Заявка № \d+ принята/ }).innerText()
  const number = Number(title.replace(/\D/g, ''))

  const session = await adminSession()
  const leads = await adminCall<{ items: { public_number: number; source: string }[] }>(
    session,
    'GET',
    '/leads?page=1',
  )
  expect(leads.items.find((lead) => lead.public_number === number)?.source).toBe('max')
})

test('9. Вне MAX в демо-сборке: демо-вход и запись', async ({ page }) => {
  await page.route('https://st.max.ru/**', (route) =>
    route.fulfill({ contentType: 'application/javascript', body: '' }),
  )
  await page.goto('/')
  await expect(page.getByRole('heading', { name: /Демо-режим/ })).toBeVisible()
  await page.getByRole('textbox', { name: /Ваше имя/ }).fill('Демо Клиент')
  await page.getByRole('button', { name: 'Продолжить' }).click()
  await expect(page.getByText('Демо', { exact: true })).toBeVisible()
  await page.locator('label.ui-card-select').filter({ hasText: 'Компьютерная диагностика' }).click()
  await afterService(page)
  await page.locator('[role="option"]:not([aria-disabled="true"])').nth(6).click()
  await page
    .getByRole('radio', { name: /^\d{2}:\d{2}$/ })
    .first()
    .click()
  await page.getByRole('button', { name: /^Далее: / }).click()
  await fillContacts(page)
  await page.getByRole('button', { name: 'Записаться' }).click()
  await expect(page.getByRole('heading', { name: 'Вы записаны' })).toBeVisible()
})

test('10. Доступность экранов на мобильном вьюпорте (axe)', async ({ page }) => {
  await openAs(page, uniqueId())
  await expect(
    page.locator('label.ui-card-select').filter({ hasText: 'Компьютерная диагностика' }),
  ).toBeVisible()
  await expectNoViolations(page)
  await page.locator('label.ui-card-select').filter({ hasText: 'Компьютерная диагностика' }).click()
  await afterService(page)
  await page.locator('[role="option"]:not([aria-disabled="true"])').nth(7).click()
  await page
    .getByRole('radio', { name: /^\d{2}:\d{2}$/ })
    .first()
    .waitFor()
  await expectNoViolations(page)
  await page
    .getByRole('radio', { name: /^\d{2}:\d{2}$/ })
    .first()
    .click()
  await page.getByRole('button', { name: /^Далее: / }).click()
  await page.getByRole('textbox', { name: /Телефон/ }).waitFor()
  await expectNoViolations(page)
  await fillContacts(page)
  await page.getByRole('button', { name: 'Записаться' }).waitFor()
  await expectNoViolations(page)
  await page.setViewportSize({ width: 390, height: 844 })
})
