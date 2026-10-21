import type { Page } from '@playwright/test'

const HUMAN_DELAY_MS = 3300

/**
 * Форма гидратируется, когда попадает в окно просмотра (hydrateOnVisible): прокручиваем к ней и
 * ждём признак готовности. Возвращает момент готовности для `waitLikeHuman`.
 */
export async function openForm(page: Page): Promise<number> {
  await page.locator('#lead-form').scrollIntoViewIfNeeded()
  await page.locator('form[data-ready="true"]').waitFor()
  return page.evaluate(() => performance.now())
}

/**
 * Сервер молча отбрасывает заявки, отправленные быстрее 3 секунд после открытия формы
 * (защита от ботов, ТЗ-1 §7.4). Живой человек столько и заполняет; тест ждёт так же.
 */
export async function waitLikeHuman(page: Page, readyAt: number): Promise<void> {
  await page.waitForFunction(([at, delay]) => performance.now() > (at ?? 0) + (delay ?? 0), [
    readyAt,
    HUMAN_DELAY_MS,
  ] as const)
}
