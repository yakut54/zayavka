import userEvent from '@testing-library/user-event'
import { screen } from '@testing-library/vue'
import { afterEach, describe, it, vi } from 'vitest'
import { axe } from 'vitest-axe'

import { setMaxBridge } from '../src/bridge/useMaxBridge'
import { mountApp } from './helpers'

afterEach(() => {
  vi.restoreAllMocks()
  setMaxBridge(null)
})

async function expectNoViolations(): Promise<void> {
  const results = await axe(document.body, { rules: { region: { enabled: false } } })
  const violations = results.violations.map(
    (v) => `${v.id}: ${v.nodes.map((n) => n.html).join(' | ')}`,
  )
  if (violations.length > 0) throw new Error(`axe violations:\n${violations.join('\n')}`)
}

describe('доступность экранов мини-приложения', () => {
  it('услуги, дата, время, контакты, подтверждение', async () => {
    await mountApp()
    const user = userEvent.setup()
    await user.click(await screen.findByRole('radio', { name: /Диагностика/ }))
    await expectNoViolations()
    await user.click(await screen.findByRole('radio', { name: /Любой свободный/ }))
    await user.click((await screen.findAllByRole('option'))[1] as HTMLElement)
    await screen.findByRole('radio', { name: '10:00' })
    await expectNoViolations()
    await user.click(screen.getByRole('radio', { name: '10:00' }))
    await user.click(await screen.findByRole('button', { name: /Далее: / }))
    await screen.findByRole('textbox', { name: /Телефон/ })
    await expectNoViolations()
    await user.type(screen.getByRole('textbox', { name: /Телефон/ }), '9991234567')
    await user.click(screen.getByRole('checkbox'))
    await user.click(screen.getByRole('button', { name: 'Далее' }))
    await screen.findByRole('button', { name: 'Записаться' })
    await expectNoViolations()
  })

  it('главная и «Мои записи»', async () => {
    await mountApp()
    await screen.findByRole('radio', { name: /Диагностика/ })
    await expectNoViolations()
  })
})
