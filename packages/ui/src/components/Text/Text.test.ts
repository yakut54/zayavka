import { describe, expect, it } from 'vitest'

import { expectAccessible, renderWithApp } from '../../../tests/helpers'
import Text from './Text.vue'

describe('Text', () => {
  it('выводит текст по ключу', () => {
    const { container } = renderWithApp(Text, { props: { k: 'demo.text' } })
    expect(container.textContent).toBe('Образец текста')
  })

  it('подставляет именованные аргументы', () => {
    const { container } = renderWithApp(Text, {
      props: { k: 'demo.greeting', args: { name: 'Анна' } },
    })
    expect(container.textContent).toBe('Здравствуйте, Анна!')
  })

  it.each([
    [0, 'нет элементов'],
    [1, '1 элемент'],
    [2, '2 элемента'],
    [5, '5 элементов'],
    [11, '11 элементов'],
    [21, '21 элемент'],
    [22, '22 элемента'],
  ])('плюрализация: %i → «%s»', (plural, expected) => {
    const { container } = renderWithApp(Text, { props: { k: 'demo.items', plural } })
    expect(container.textContent).toBe(expected)
  })

  it('рендерит указанный тег и классы варианта, тона и выравнивания', () => {
    const { container } = renderWithApp(Text, {
      props: {
        k: 'demo.text',
        as: 'p',
        variant: 'h2',
        tone: 'muted',
        weight: 'bold',
        align: 'center',
      },
    })
    const el = container.firstElementChild as HTMLElement
    expect(el.tagName).toBe('P')
    expect(el.classList).toContain('ui-text--h2')
    expect(el.classList).toContain('ui-text--tone-muted')
    expect(el.classList).toContain('ui-text--w-bold')
    expect(el.classList).toContain('ui-text--align-center')
  })

  it('ограничивает число строк', () => {
    const { container } = renderWithApp(Text, { props: { k: 'demo.long', lines: 2 } })
    const el = container.firstElementChild as HTMLElement
    expect(el.classList).toContain('ui-text--clamp')
    expect(el.style.getPropertyValue('--ui-text-lines')).toBe('2')
  })

  it('доступен', async () => {
    const { container } = renderWithApp(Text, { props: { k: 'demo.text', as: 'p' } })
    await expectAccessible(container)
  })
})
