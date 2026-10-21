import { describe, expect, it } from 'vitest'

import { expectAccessible, renderWithApp } from '../../../tests/helpers'
import Heading from './Heading.vue'

describe('Heading', () => {
  it.each([1, 2, 3, 4] as const)('level %i рендерит h%i', (level) => {
    const { container } = renderWithApp(Heading, { props: { k: 'demo.title', level } })
    expect(container.querySelector(`h${level}`)?.textContent).toBe('Заголовок')
  })

  it('внешний вид отделён от уровня', () => {
    const { container } = renderWithApp(Heading, {
      props: { k: 'demo.title', level: 2, variant: 'display' },
    })
    expect(container.querySelector('h2 .ui-text--display')).not.toBeNull()
  })

  it.each([
    [1, 'h1'],
    [2, 'h2'],
    [3, 'h3'],
    [4, 'h3'],
  ] as const)('по умолчанию level %i выглядит как %s', (level, variant) => {
    const { container } = renderWithApp(Heading, { props: { k: 'demo.title', level } })
    expect(container.querySelector(`.ui-text--${variant}`)).not.toBeNull()
  })

  it('передаёт аргументы и выравнивание', () => {
    const { container } = renderWithApp(Heading, {
      props: { k: 'demo.greeting', args: { name: 'Олег' }, level: 1, align: 'center' },
    })
    expect(container.textContent).toBe('Здравствуйте, Олег!')
    expect(container.querySelector('.ui-text--align-center')).not.toBeNull()
  })

  it('доступен', async () => {
    const { container } = renderWithApp(Heading, { props: { k: 'demo.title', level: 1 } })
    await expectAccessible(container)
  })
})
