import AxeBuilder from '@axe-core/playwright'
import { type Page, expect, test } from '@playwright/test'

import { signIn } from '../support/admin'
import { ADMIN_URL } from '../support/env'
import { clearStub, createMaxBooking, installBridge, messagesTo } from '../support/max'
import { RESOURCE_NAME, adminCall, adminSession } from '../support/seed'

test.use({ baseURL: ADMIN_URL })

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']
const uniqueId = (): number => 800_000 + Math.floor(Math.random() * 100_000)

async function expectNoViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze()
  expect(
    results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`),
  ).toEqual([])
}

async function mainResourceId(): Promise<string> {
  const session = await adminSession()
  const list = await adminCall<{ id: string; name: string }[]>(session, 'GET', '/resources')
  const found = list.find((r) => r.name === RESOURCE_NAME)
  if (!found) throw new Error('нет сотрудника для e2e')
  return found.id
}

/** Дата записи в часовом поясе бизнеса: YYYY-MM-DD. */
const businessDay = (iso: string): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Novosibirsk' }).format(new Date(iso))

test.beforeEach(async ({ page }) => {
  await clearStub()
  await signIn(page)
})

test('6. Сотрудник: создать, назначить услуги, задать график → в мини-приложении есть слоты', async ({
  page,
  browser,
}) => {
  const name = `Мастер ${Date.now() % 100_000}`
  await page.goto('/resources')
  await page.getByRole('button', { name: 'Добавить сотрудника' }).first().click()
  await page.locator('input[name="name"]').fill(name)
  await page.locator('label.ui-checkbox', { hasText: 'Компьютерная диагностика' }).click()
  await page.getByRole('button', { name: 'Добавить', exact: true }).click()
  await expect(page.getByRole('tab', { name: 'График' })).toBeVisible()

  await page.getByRole('tab', { name: 'График' }).click()
  // график нового сотрудника пуст: включаем день и копируем на остальные
  const toggles = page.locator('label.ui-checkbox', { hasText: /Рабочий день/ })
  await toggles.first().click()
  await page.getByRole('button', { name: /Скопировать понедельник/ }).click()
  for (const day of [5, 6]) await toggles.nth(day).click()
  await page.getByRole('button', { name: 'Сохранить график' }).click()
  await expect(page.getByText('График сохранён')).toBeVisible()

  // мини-приложение: специалист появился, у него есть слоты
  const context = await browser.newContext({ baseURL: 'http://localhost:8082', locale: 'ru-RU' })
  const miniapp = await context.newPage()
  await installBridge(miniapp, { id: uniqueId(), first_name: 'Клиент' })
  await miniapp.goto('/')
  await miniapp
    .locator('label.ui-card-select')
    .filter({ hasText: 'Компьютерная диагностика' })
    .click()
  await miniapp.locator('label.ui-card-select').filter({ hasText: name }).click()
  await miniapp.locator('[role="option"]:not([aria-disabled="true"])').first().click()
  await expect(miniapp.getByRole('radio', { name: /^\d{2}:\d{2}$/ }).first()).toBeVisible()
  await context.close()
})

test('7. Выходной на день с записью → диалог конфликта → отмена и уведомление клиента', async ({
  page,
}) => {
  const resourceId = await mainResourceId()
  const user = { id: uniqueId(), first_name: 'Конфликт' }
  const booking = await createMaxBooking(user, resourceId, { dayOffset: 8 })

  await page.goto('/resources')
  await page.getByRole('button', { name: RESOURCE_NAME }).click()
  await page.getByRole('tab', { name: 'Исключения' }).click()
  await page.locator('input[type="date"]').fill(businessDay(booking.starts_at))
  await page.getByRole('button', { name: 'Добавить', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText(`№ ${booking.public_number}`)).toBeVisible()
  await dialog.getByRole('button', { name: 'Отменить эти записи и уведомить клиентов' }).click()
  await expect(page.getByText('Исключение добавлено')).toBeVisible()

  await expect
    .poll(() => messagesTo(user.id), { timeout: 30_000 })
    .toContainEqual(expect.stringContaining('тмен'))
  const session = await adminSession()
  const detail = await adminCall<{ booking: { status: string; cancel_reason: string } }>(
    session,
    'GET',
    `/bookings/${booking.id}`,
  )
  expect(detail.booking).toMatchObject({
    status: 'cancelled_by_business',
    cancel_reason: 'Изменение графика',
  })
})

test('8. Календарь дня показывает запись; «Пришёл» меняет статус', async ({ page }) => {
  const resourceId = await mainResourceId()
  const user = { id: uniqueId(), first_name: 'Календарный' }
  const booking = await createMaxBooking(user, resourceId, { dayOffset: 10 })
  // для администратора запись «началась»: браузерные часы переведены за время начала
  await page.clock.setFixedTime(new Date(Date.parse(booking.starts_at) + 5 * 60_000))

  await page.goto(`/bookings?date=${businessDay(booking.starts_at)}`)
  const block = page.getByRole('button', { name: /Календарный/ })
  await expect(block).toBeVisible()
  await block.click()
  const drawer = page.getByRole('dialog')
  await expect(drawer.getByText(`Запись № ${booking.public_number}`)).toBeVisible()
  await drawer.getByRole('button', { name: 'Пришёл', exact: true }).click()
  await expect(page.getByText('Статус изменён')).toBeVisible()
})

test('список с экспортом и ручная запись', async ({ page }) => {
  const resourceId = await mainResourceId()
  const user = { id: uniqueId(), first_name: 'Для списка' }
  const booking = await createMaxBooking(user, resourceId, { dayOffset: 12 })
  const day = businessDay(booking.starts_at)

  await page.goto(`/bookings?view=list&from=${day}&to=${day}`)
  await expect(page.getByRole('row', { name: /Для списка/ })).toBeVisible()
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Скачать CSV' }).click(),
  ])
  expect(download.suggestedFilename()).toMatch(/^bookings-\d{4}-\d{2}-\d{2}\.csv$/)

  await page.getByRole('button', { name: 'Записать клиента' }).first().click()
  const drawer = page.getByRole('dialog')
  await drawer.locator('input[type="date"]').fill(day)
  await drawer.getByLabel(/Время/).selectOption({ index: 1 })
  await drawer.locator('input[name="name"]').fill('Ручной Клиент')
  await drawer.getByRole('textbox', { name: /Телефон/ }).pressSequentially('9995550000')
  await drawer.getByRole('button', { name: 'Записать', exact: true }).click()
  await expect(page.getByText('Запись создана')).toBeVisible()
})

test('10. Новые экраны админки без нарушений axe', async ({ page }) => {
  await page.goto('/bookings')
  await expect(page.getByRole('heading', { name: 'Записи' })).toBeVisible()
  await expectNoViolations(page)
  await page.goto('/bookings?view=list')
  await expect(page.getByRole('button', { name: 'Скачать CSV' })).toBeVisible()
  await expectNoViolations(page)
  await page.goto('/resources')
  await expect(page.getByRole('heading', { name: 'Сотрудники' })).toBeVisible()
  await expectNoViolations(page)
  await page.goto('/booking-settings')
  await expect(page.getByRole('heading', { name: 'Настройки записи' })).toBeVisible()
  await expectNoViolations(page)
})
