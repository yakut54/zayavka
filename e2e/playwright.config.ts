import { defineConfig, devices } from '@playwright/test'

/**
 * E2E против compose.test.yml: сайт — :8080, админка — :8081, мини-приложение — :8082,
 * Mailpit API — :18025, заглушка Bot API MAX — :19000.
 * PW_CHANNEL=chrome — использовать установленный Chrome; E2E_WEBKIT=1 — добавить WebKit (CI).
 */
const channel = process.env.PW_CHANNEL
const chromium = channel ? { channel } : {}

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  globalSetup: './support/global-setup.ts',
  use: {
    baseURL: 'http://localhost:8080',
    locale: 'ru-RU',
    timezoneId: 'Asia/Novosibirsk',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], ...chromium },
      testIgnore: [/.*.mobile.spec.ts/, /max.spec.ts/],
    },
    {
      name: 'mobile',
      use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 }, ...chromium },
      testMatch: /.*\.mobile\.spec\.ts/,
    },
    {
      name: 'max',
      use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 }, ...chromium },
      testMatch: /max.spec.ts/,
    },
    ...(process.env.E2E_WEBKIT
      ? [{ name: 'webkit', use: { ...devices['Desktop Safari'] }, testMatch: /site\.spec\.ts/ }]
      : []),
  ],
})
