import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

import { openForm, waitLikeHuman } from '../support/human'
import { clearMailbox, waitForMail } from '../support/mailpit'

test.beforeEach(async () => {
  await clearMailbox()
})

test.describe('сценарий 9: мобильный вьюпорт 390×844', () => {
  test('меню открывается и закрывается', async ({ page }) => {
    await page.goto('/')
    const burger = page.getByRole('button', { name: 'Меню' })
    await expect(burger).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'Основная навигация' }).first()).toBeHidden()
    await burger.click()
    const dialog = page.getByRole('dialog', { name: 'Меню' })
    await expect(dialog).toBeVisible()
    await expect(burger).toHaveAttribute('aria-expanded', 'true')
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect(burger).toHaveAttribute('aria-expanded', 'false')

    await burger.click()
    await page.getByRole('dialog').getByRole('button', { name: 'Закрыть' }).click()
    await expect(page.getByRole('dialog')).toBeHidden()
  })

  test('пункт меню закрывает меню и ведёт к секции', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Меню' }).click()
    await page.getByRole('dialog').getByRole('link', { name: 'Контакты' }).click()
    await expect(page.getByRole('dialog')).toBeHidden()
    await expect(page.locator('#contacts')).toBeInViewport()
  })

  test('форма отправляется с телефона', async ({ page }) => {
    await page.goto('/')
    const readyAt = await openForm(page)
    await page.locator('input[name="name"]').fill('Мария')
    await page.locator('input[name="phone"]').pressSequentially('9991234567')
    await page.locator('input[name="consent"]').check()
    await waitLikeHuman(page, readyAt)
    await page.getByRole('button', { name: 'Отправить заявку' }).click()
    const heading = page.getByRole('heading', { name: /Заявка № \d+ принята/ })
    await expect(heading).toBeVisible()
    const number = /№ (\d+)/.exec((await heading.textContent()) ?? '')?.[1]
    await waitForMail(`Новая заявка № ${number}`)
  })

  test('нет горизонтальной прокрутки и достаточные зоны нажатия', async ({ page }) => {
    await page.goto('/')
    await page.locator('input[name="name"]').waitFor()
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow).toBeLessThanOrEqual(0)
    const small = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('main button, header button')]
        .filter((b) => b.offsetParent !== null)
        .map((b) => ({ text: b.textContent?.trim(), h: b.getBoundingClientRect().height }))
        .filter((b) => b.h < 36),
    )
    expect(small).toEqual([])
  })

  test('axe на мобильном', async ({ page }) => {
    await page.goto('/')
    await page.locator('input[name="name"]').waitFor()
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze()
    expect(results.violations.map((v) => v.id)).toEqual([])
  })
})
