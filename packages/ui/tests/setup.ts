import { i18n } from '@app/i18n'
import { cleanup } from '@testing-library/vue'
import { config } from '@vue/test-utils'
import { afterEach, expect } from 'vitest'
import * as axeMatchers from 'vitest-axe/matchers'
import type { AxeMatchers } from 'vitest-axe/matchers'

expect.extend(axeMatchers)

config.global.plugins = [i18n]

afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
})

declare module 'vitest' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface Assertion extends AxeMatchers {}
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface AsymmetricMatchersContaining extends AxeMatchers {}
}
