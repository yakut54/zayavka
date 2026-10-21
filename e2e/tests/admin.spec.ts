import { readFileSync } from 'node:fs'

import AxeBuilder from '@axe-core/playwright'
import { type Page, expect, test } from '@playwright/test'

import { createAdmin, createLead, loginAs, signIn } from '../support/admin'
import { ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_URL } from '../support/env'

test.use({ baseURL: ADMIN_URL })

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']

async function expectNoViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze()
  expect(
    results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`),
  ).toEqual([])
}

test.describe('вход', () => {
  test('неверный пароль → общее сообщение, поля не подсвечиваются', async ({ page }) => {
    await loginAs(page, ADMIN_EMAIL, 'совсем-не-тот-пароль')
    await expect(
      page.getByRole('alert').filter({ hasText: 'Неверный email или пароль' }),
    ).toBeVisible()
    await expect(page.locator('input[name="email"]')).not.toHaveAttribute('aria-invalid', 'true')
    await expect(page).toHaveURL(/\/login/)
  })

  test('несуществующий email — то же сообщение', async ({ page }) => {
    await loginAs(page, 'nobody@example.ru', 'какой-то-пароль-123')
    await expect(
      page.getByRole('alert').filter({ hasText: 'Неверный email или пароль' }),
    ).toBeVisible()
  })

  test('пустая форма: ошибки полей и фокус на первом', async ({ page }) => {
    await page.goto('/login')
    await page.getByRole('button', { name: 'Войти' }).click()
    await expect(page.getByText('Заполните это поле').first()).toBeVisible()
    await expect(page.locator('input[name="email"]')).toBeFocused()
  })

  test('Enter отправляет форму, после входа — список заявок', async ({ page }) => {
    await page.goto('/login')
    await page.locator('input[name="email"]').fill(ADMIN_EMAIL)
    await page.locator('input[name="password"]').fill(ADMIN_PASSWORD)
    await page.locator('input[name="password"]').press('Enter')
    await expect(page).toHaveURL(/\/leads$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Заявки' })).toBeVisible()
  })

  test('защищённая страница без сессии ведёт на вход и возвращает по next', async ({ page }) => {
    await page.goto('/account')
    await expect(page).toHaveURL(/\/login\?next=(%2F|\/)account/)
    await page.locator('input[name="email"]').fill(ADMIN_EMAIL)
    await page.locator('input[name="password"]').fill(ADMIN_PASSWORD)
    await page.getByRole('button', { name: 'Войти' }).click()
    await expect(page).toHaveURL(/\/account$/)
  })

  test('внешний адрес в next игнорируется (открытый редирект)', async ({ page }) => {
    await page.goto('/login?next=https://evil.example/steal')
    await page.locator('input[name="email"]').fill(ADMIN_EMAIL)
    await page.locator('input[name="password"]').fill(ADMIN_PASSWORD)
    await page.getByRole('button', { name: 'Войти' }).click()
    await expect(page).toHaveURL(/\/leads$/)
    expect(new URL(page.url()).origin).toBe(ADMIN_URL)
  })

  test('в админке robots noindex и заголовки безопасности', async ({ request }) => {
    const response = await request.get('/login')
    expect(response.headers()['x-robots-tag']).toContain('noindex')
    expect(response.headers()['content-security-policy']).toContain("frame-ancestors 'none'")
    expect(await response.text()).toContain('noindex')
  })

  test('axe: страница входа', async ({ page }) => {
    await page.goto('/login')
    await page.getByRole('button', { name: 'Войти' }).waitFor()
    await expectNoViolations(page)
  })
})

test.describe('заявки', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page)
    await expect(page).toHaveURL(/\/leads/)
  })

  test('сценарий 4: свежая заявка первая в списке, смена статуса попадает в историю', async ({
    page,
    request,
  }) => {
    const lead = await createLead(request, { service: 'tires', message: 'Нужна смена шин' })
    await page.reload()
    const firstRow = page.locator('tbody tr').first()
    await expect(firstRow).toContainText(lead.name)
    await expect(firstRow).toContainText(`${lead.number}`)
    await expect(firstRow).toContainText('Шиномонтаж')
    await expect(firstRow).toContainText('+7 (999) 000-11-22')
    await expect(firstRow).toContainText('Новая')

    await firstRow.click()
    await expect(page).toHaveURL(new RegExp(`/leads/[0-9a-f-]{36}`))
    const drawer = page.getByRole('dialog', { name: `Заявка № ${lead.number}` })
    await expect(drawer).toBeVisible()
    await expect(drawer).toContainText(lead.name)
    await expect(drawer).toContainText('Нужна смена шин')
    await expect(drawer.getByRole('link', { name: 'Позвонить' })).toHaveAttribute(
      'href',
      'tel:+79990001122',
    )

    await drawer.getByLabel('Статус').selectOption('in_progress')
    await expect(page.getByText('Статус изменён')).toBeVisible()
    await expect(drawer.getByText('Статус: Новая → В работе')).toBeVisible()
    await expect(drawer).toContainText(ADMIN_EMAIL)
    await expect(drawer.getByLabel('Статус')).toHaveValue('in_progress')
  })

  test('перевод в «Спам» требует подтверждения', async ({ page, request }) => {
    const lead = await createLead(request)
    await page.reload()
    await page.locator('tbody tr').filter({ hasText: lead.name }).click()
    const drawer = page.getByRole('dialog', { name: `Заявка № ${lead.number}` })
    await drawer.getByLabel('Статус').selectOption('spam')
    const confirm = page.getByRole('dialog', { name: 'Отметить как спам?' })
    await expect(confirm).toBeVisible()
    await confirm.getByRole('button', { name: 'Отмена' }).click()
    await expect(drawer.getByLabel('Статус')).toHaveValue('new')

    await drawer.getByLabel('Статус').selectOption('spam')
    await page
      .getByRole('dialog', { name: 'Отметить как спам?' })
      .getByRole('button', { name: 'Отметить' })
      .click()
    await expect(page.getByText('Статус изменён')).toBeVisible()
    await expect(drawer.getByLabel('Статус')).toHaveValue('spam')
  })

  test('сценарий 5: заметка добавляется по Ctrl+Enter', async ({ page, request }) => {
    const lead = await createLead(request)
    await page.reload()
    await page.locator('tbody tr').filter({ hasText: lead.name }).click()
    const drawer = page.getByRole('dialog', { name: `Заявка № ${lead.number}` })
    const add = drawer.getByRole('button', { name: 'Добавить заметку' })
    await expect(add).toBeDisabled()
    const note = drawer.getByLabel('Добавьте заметку')
    await note.fill('Позвонил, договорились на завтра')
    await expect(add).toBeEnabled()
    await note.press('Control+Enter')
    await expect(drawer.getByText('Позвонил, договорились на завтра')).toBeVisible()
    await expect(note).toHaveValue('')
    await expect(add).toBeDisabled()
  })

  test('конфликт версий: заявку изменили в другой вкладке', async ({ page, request, context }) => {
    const lead = await createLead(request)
    await page.reload()
    await page.locator('tbody tr').filter({ hasText: lead.name }).click()
    const drawer = page.getByRole('dialog', { name: `Заявка № ${lead.number}` })
    await expect(drawer).toBeVisible()

    const other = await context.newPage()
    await other.goto('/leads')
    await other.locator('tbody tr').filter({ hasText: lead.name }).click()
    await other.getByRole('dialog').getByLabel('Статус').selectOption('done')
    await expect(other.getByText('Статус изменён')).toBeVisible()
    await other.close()

    await drawer.getByLabel('Статус').selectOption('archived')
    await expect(page.getByText('Заявку уже изменили. Показана актуальная версия')).toBeVisible()
    await expect(drawer.getByLabel('Статус')).toHaveValue('done')
  })

  test('сценарий 6: фильтр «Новые» и поиск по телефону отражаются в URL и переживают перезагрузку', async ({
    page,
    request,
  }) => {
    const unique = `+7999${String(Date.now()).slice(-7)}`
    const lead = await createLead(request, { phone: unique })
    await page.reload()
    await page.getByLabel('Статус', { exact: true }).selectOption('new')
    await page.getByLabel('Поиск по имени, телефону или номеру').fill(unique.slice(-7))
    await expect(page).toHaveURL(/status=new/)
    await expect(page).toHaveURL(new RegExp(`q=${unique.slice(-7)}`))
    await expect(page.locator('tbody tr')).toHaveCount(1)
    await expect(page.locator('tbody tr').first()).toContainText(lead.name)

    await page.reload()
    await expect(page.getByLabel('Статус', { exact: true })).toHaveValue('new')
    await expect(page.getByLabel('Поиск по имени, телефону или номеру')).toHaveValue(
      unique.slice(-7),
    )
    await expect(page.locator('tbody tr')).toHaveCount(1)

    await page.getByRole('button', { name: 'Сбросить фильтры' }).first().click()
    await expect(page).toHaveURL(/\/leads$/)
  })

  test('поиск без результатов: пустое состояние со сбросом', async ({ page }) => {
    await page.getByLabel('Поиск по имени, телефону или номеру').fill('zzzнет-такого-zzz')
    await expect(page.getByText('Ничего не найдено')).toBeVisible()
    await page.getByRole('button', { name: 'Сбросить фильтры' }).last().click()
    await expect(page.locator('tbody tr').first()).toBeVisible()
  })

  test('период: «по» раньше «с» — ошибка поля', async ({ page }) => {
    await page.getByLabel('С', { exact: true }).fill('2026-10-10')
    await page.getByLabel('По', { exact: true }).fill('2026-10-01')
    await expect(page.getByText('Дата «по» не может быть раньше даты «с»')).toBeVisible()
    await expect(page).toHaveURL(/date_from=2026-10-10/)
  })

  test('сортировка по дате переключается и отражается в aria-sort', async ({ page, request }) => {
    await createLead(request)
    await page.reload()
    const header = page.getByRole('columnheader', { name: 'Дата' })
    await expect(header).toHaveAttribute('aria-sort', 'descending')
    await header.getByRole('button').click()
    await expect(header).toHaveAttribute('aria-sort', 'ascending')
    await expect(page).toHaveURL(/sort=created_at/)
  })

  test('прямая ссылка на карточку открывает её', async ({ page, request }) => {
    const lead = await createLead(request)
    await page.reload()
    await page.locator('tbody tr').filter({ hasText: lead.name }).click()
    const url = page.url()
    await page.goto(url)
    await expect(page.getByRole('dialog', { name: `Заявка № ${lead.number}` })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page).toHaveURL(/\/leads$/)
  })

  test('сценарий 7: CSV скачивается с BOM и содержит заявку', async ({ page, request }) => {
    const lead = await createLead(request, { service: 'brakes' })
    await page.reload()
    const download = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Скачать CSV' }).click()
    const file = await download
    expect(file.suggestedFilename()).toMatch(/^leads-\d{4}-\d{2}-\d{2}\.csv$/)
    const buffer = readFileSync((await file.path()) as string)
    expect([...buffer.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf])
    const text = buffer.toString('utf8')
    expect(text).toContain('Номер;Дата;Имя;Телефон')
    expect(text).toContain(lead.name)
    expect(text).toContain('Ремонт тормозов')
  })

  test('копирование телефона показывает уведомление', async ({ page, request, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await createLead(request)
    await page.reload()
    await page
      .locator('tbody tr')
      .first()
      .getByRole('button', { name: 'Скопировать телефон' })
      .click()
    await expect(page.getByText('Телефон скопирован')).toBeVisible()
    await expect(page).toHaveURL(/\/leads$/)
  })

  test('переключатель темы', async ({ page }) => {
    const toggle = page.getByRole('button', { name: /Включить тёмную тему|Включить светлую тему/ })
    const before = await page.evaluate(() => document.documentElement.dataset.theme)
    await toggle.click()
    const after = await page.evaluate(() => document.documentElement.dataset.theme)
    expect(after).not.toBe(before)
    await page.reload()
    expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe(after)
  })

  test('первая в табуляции — ссылка «Перейти к содержимому»', async ({ page }) => {
    await page.keyboard.press('Tab')
    await expect(page.getByRole('link', { name: 'Перейти к содержимому' })).toBeFocused()
  })

  test('axe: список заявок и карточка', async ({ page, request }) => {
    const lead = await createLead(request, { message: 'Проверка доступности' })
    await page.reload()
    await expect(page.locator('tbody tr').first()).toBeVisible()
    await expectNoViolations(page)
    await page.locator('tbody tr').filter({ hasText: lead.name }).click()
    await expect(page.getByRole('dialog', { name: `Заявка № ${lead.number}` })).toBeVisible()
    await expectNoViolations(page)
  })
})

test.describe('аккаунт', () => {
  test('смена пароля: валидация на клиенте', async ({ page }) => {
    await signIn(page)
    await page.goto('/account')
    await page.locator('input[name="currentPassword"]').fill('что-то')
    await page.locator('input[name="newPassword"]').fill('короткий')
    await expect(page.getByText('8 из 12 символов')).toBeVisible()
    await page.locator('input[name="newPasswordConfirm"]').fill('другой')
    await page.getByRole('button', { name: 'Сменить пароль' }).click()
    await expect(page.getByText('Слишком коротко')).toBeVisible()
    await expect(page.getByText('Пароли не совпадают')).toBeVisible()
  })

  test('сервер отклоняет неверный текущий пароль', async ({ page }) => {
    await signIn(page)
    await page.goto('/account')
    await page.locator('input[name="currentPassword"]').fill('неверный-текущий-пароль')
    await page.locator('input[name="newPassword"]').fill('очень-длинный-новый-пароль')
    await page.locator('input[name="newPasswordConfirm"]').fill('очень-длинный-новый-пароль')
    await page.getByRole('button', { name: 'Сменить пароль' }).click()
    await expect(page.getByText('Неверный пароль')).toBeVisible()
  })

  test('успешная смена пароля завершает остальные сеансы', async ({ browser }) => {
    const email = `e2e-pwd-${Date.now()}@example.ru`
    createAdmin(email, 'старый-пароль-12345')
    const first = await (await browser.newContext()).newPage()
    const second = await (await browser.newContext()).newPage()
    await signIn(first, email, 'старый-пароль-12345')
    await signIn(second, email, 'старый-пароль-12345')
    await first.goto('/account')
    await first.locator('input[name="currentPassword"]').fill('старый-пароль-12345')
    await first.locator('input[name="newPassword"]').fill('новый-пароль-12345')
    await first.locator('input[name="newPasswordConfirm"]').fill('новый-пароль-12345')
    await first.getByRole('button', { name: 'Сменить пароль' }).click()
    await expect(first.getByText('Пароль изменён. Остальные сеансы завершены')).toBeVisible()
    await first.reload()
    await expect(first).toHaveURL(/\/account/)
    await second.goto('/leads')
    await expect(second).toHaveURL(/\/login/)
  })

  test('сценарий 8: «Выйти на всех устройствах» завершает сессии, старая вкладка уходит на вход', async ({
    browser,
  }) => {
    const email = 'e2e-revoke@example.ru'
    createAdmin(email, 'пароль-для-отзыва-123')
    const a = await (await browser.newContext()).newPage()
    const b = await (await browser.newContext()).newPage()
    await signIn(a, email, 'пароль-для-отзыва-123')
    await signIn(b, email, 'пароль-для-отзыва-123')
    await expect(b).toHaveURL(/\/leads/)

    await a.goto('/account')
    await a.getByRole('button', { name: 'Выйти на всех устройствах' }).click()
    const dialog = a.getByRole('dialog', { name: 'Выйти на всех устройствах?' })
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: 'Выйти везде' }).click()
    await expect(a).toHaveURL(/\/login/)

    // старая вкладка: следующий запрос получает 401 → вход и уведомление
    await b.getByLabel('Поиск по имени, телефону или номеру').fill('что-нибудь')
    await expect(b).toHaveURL(/\/login/)
    await expect(b.getByText('Сессия истекла, войдите снова')).toBeVisible()
  })

  test('выход из шапки возвращает на страницу входа', async ({ page }) => {
    await signIn(page)
    await page.getByRole('button', { name: 'Выйти', exact: true }).click()
    await expect(page).toHaveURL(/\/login/)
    await page.goto('/leads')
    await expect(page).toHaveURL(/\/login/)
  })

  test('axe: страница аккаунта', async ({ page }) => {
    await signIn(page)
    await page.goto('/account')
    await expect(page.getByRole('heading', { level: 1, name: 'Аккаунт' })).toBeVisible()
    await expectNoViolations(page)
  })
})
