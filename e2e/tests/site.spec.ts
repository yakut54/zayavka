import AxeBuilder from '@axe-core/playwright'
import { type Page, expect, test } from '@playwright/test'

import { openForm, waitLikeHuman } from '../support/human'
import { clearMailbox, mailBody, waitForMail } from '../support/mailpit'

const PAGES = ['/', '/privacy', '/consent', '/nope']

test.beforeEach(async () => {
  await clearMailbox()
})

async function fillForm(page: Page, name = 'Иван Петров') {
  await page.locator('input[name="name"]').fill(name)
  await page.locator('input[name="phone"]').pressSequentially('9991234567')
  await page.locator('input[name="consent"]').check()
}

test.describe('сценарий 1: заявка с главной', () => {
  test('форма отправляется, показывается номер, письмо приходит в Mailpit', async ({ page }) => {
    await page.goto('/')
    const readyAt = await openForm(page)
    await fillForm(page)
    await page.locator('select[name="serviceSlug"]').selectOption('tires')
    await page.locator('textarea[name="message"]').fill('Нужно сменить резину')
    await waitLikeHuman(page, readyAt)
    await page.getByRole('button', { name: 'Отправить заявку' }).click()

    const heading = page.getByRole('heading', { name: /Заявка № \d+ принята/ })
    await expect(heading).toBeVisible()
    await expect(heading).toBeFocused()
    const number = /№ (\d+)/.exec((await heading.textContent()) ?? '')?.[1]
    expect(number).toBeTruthy()
    await expect(
      page.getByText('Перезвоним в течение 15 минут в рабочее время').last(),
    ).toBeVisible()

    const mail = await waitForMail(`Новая заявка № ${number}`)
    expect(mail.To[0]?.Address).toBe('owner@example.ru')
    const body = await mailBody(mail.ID)
    expect(body.Text).toContain('Иван Петров')
    expect(body.Text).toContain('+79991234567')
    expect(body.Text).toContain('Шиномонтаж')
    expect(body.Text).toContain('Нужно сменить резину')
  })

  test('«Отправить ещё одну» возвращает пустую форму без согласия', async ({ page }) => {
    await page.goto('/')
    const readyAt = await openForm(page)
    await fillForm(page)
    await waitLikeHuman(page, readyAt)
    await page.getByRole('button', { name: 'Отправить заявку' }).click()
    await page.getByRole('button', { name: 'Отправить ещё одну' }).click()
    await expect(page.locator('input[name="name"]')).toHaveValue('')
    await expect(page.locator('input[name="consent"]')).not.toBeChecked()
  })

  test('UTM-метки из адреса уходят в заявку', async ({ page }) => {
    await page.goto('/?utm_source=yandex&utm_campaign=autumn')
    const readyAt = await openForm(page)
    const request = page.waitForRequest((r) => r.url().endsWith('/api/v1/public/leads'))
    await fillForm(page)
    await waitLikeHuman(page, readyAt)
    await page.getByRole('button', { name: 'Отправить заявку' }).click()
    const body = (await request).postDataJSON()
    expect(body.utm).toEqual({ utm_source: 'yandex', utm_campaign: 'autumn' })
    expect(body.policy_version).toBe('2026-10-20')
    expect(body.website).toBe('')
    expect(body.elapsed_ms).toBeGreaterThan(0)
  })
})

test.describe('сценарий 2: выбор услуги в карточке', () => {
  test('форма прокручена, услуга предвыбрана, фокус на имени', async ({ page }) => {
    await page.goto('/')
    await page
      .locator('#services')
      .getByRole('article')
      .filter({ hasText: 'Ремонт тормозов' })
      .getByRole('button', { name: 'Выбрать' })
      .click()
    await expect(page.locator('select[name="serviceSlug"]')).toHaveValue('brakes')
    await expect(page.locator('input[name="name"]')).toBeFocused()
    await expect(page.locator('#lead-form')).toBeInViewport()
  })
})

test.describe('сценарий 3: пустая форма', () => {
  test('ошибки, Alert со ссылками, фокус на «Имя»', async ({ page }) => {
    await page.goto('/')
    await page.locator('input[name="name"]').waitFor()
    await page.getByRole('button', { name: 'Отправить заявку' }).click()
    const alert = page.locator('[role="alert"].ui-alert')
    await expect(alert).toContainText('Проверьте поля формы')
    await expect(alert.getByRole('link')).toHaveCount(3)
    await expect(page.locator('input[name="name"]')).toBeFocused()
    await expect(page.getByText('Заполните это поле').first()).toBeVisible()
    await expect(page.getByText('Нужно согласие на обработку данных').first()).toBeVisible()
    await alert.getByRole('link', { name: 'Телефон' }).click()
    await expect(page.locator('input[name="phone"]')).toBeFocused()
  })

  test('неверный телефон на сервере раскладывается по полю', async ({ page }) => {
    await page.goto('/')
    const readyAt = await openForm(page)
    await page.locator('input[name="name"]').fill('Иван')
    await page.locator('input[name="phone"]').pressSequentially('0000000000')
    await page.locator('input[name="consent"]').check()
    await waitLikeHuman(page, readyAt)
    await page.getByRole('button', { name: 'Отправить заявку' }).click()
    await expect(page.getByText('Проверьте номер телефона').first()).toBeVisible()
    await expect(page.locator('input[name="phone"]')).toBeFocused()
  })
})

test.describe('прочее', () => {
  test('честность демо: плашка «Демо-проект», нет отзывов', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('footer')).toContainText('Демо-проект')
    await expect(page.getByText(/отзыв/i)).toHaveCount(0)
  })

  test('до действия пользователя нет запросов на чужие домены', async ({ page }) => {
    const external: string[] = []
    page.on('request', (r) => {
      const url = new URL(r.url())
      if (url.protocol.startsWith('http') && url.origin !== 'http://localhost:8080')
        external.push(r.url())
    })
    await page.goto('/')
    await page.locator('input[name="name"]').waitFor()
    await page.waitForLoadState('networkidle')
    expect(external).toEqual([])
  })

  test('карта грузится только после клика', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('iframe')).toHaveCount(0)
    await page.route('https://yandex.ru/**', (route) =>
      route.fulfill({ body: '<html></html>', contentType: 'text/html' }),
    )
    await page.getByRole('button', { name: 'Показать карту' }).click()
    await expect(page.locator('iframe[title="Карта проезда"]')).toBeVisible()
  })

  test('нет нарушений CSP и ошибок в консоли', async ({ page }) => {
    const problems: string[] = []
    page.on('console', (m) => {
      if (m.type() === 'error' || m.type() === 'warning') problems.push(m.text())
    })
    page.on('pageerror', (e) => problems.push(e.message))
    await page.goto('/')
    await page.locator('input[name="name"]').waitFor()
    await page.getByRole('button', { name: 'Оставить заявку' }).first().click()
    await page.waitForLoadState('networkidle')
    expect(problems).toEqual([])
  })

  test('заголовки безопасности и кэширование', async ({ request }) => {
    const home = await request.get('/')
    const headers = home.headers()
    expect(headers['strict-transport-security']).toContain('max-age=31536000')
    expect(headers['x-content-type-options']).toBe('nosniff')
    expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin')
    expect(headers['content-security-policy']).toContain("script-src 'self'")
    expect(headers['cache-control']).toBe('no-cache')
    const html = await home.text()
    const asset = /\/assets\/[^"']+\.js/.exec(html)?.[0]
    expect(asset).toBeTruthy()
    const js = await request.get(asset as string)
    expect(js.headers()['cache-control']).toContain('immutable')
  })

  test('404 отдаёт страницу со статусом 404', async ({ request }) => {
    const response = await request.get('/нет-такой-страницы')
    expect(response.status()).toBe(404)
    expect(await response.text()).toContain('Страница не найдена')
  })

  test('robots.txt закрывает демо, sitemap и manifest на месте', async ({ request }) => {
    expect(await (await request.get('/robots.txt')).text()).toContain('Disallow: /')
    expect((await request.get('/sitemap.xml')).status()).toBe(200)
    expect((await request.get('/site.webmanifest')).status()).toBe(200)
  })
})

test.describe('сценарий 10: доступность страниц сайта', () => {
  for (const path of PAGES) {
    test(`axe: ${path}`, async ({ page }) => {
      await page.goto(path)
      await page.waitForLoadState('networkidle')
      if (path === '/') await page.locator('input[name="name"]').waitFor()
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .analyze()
      expect(
        results.violations.map(
          (v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`,
        ),
      ).toEqual([])
    })
  }
})
