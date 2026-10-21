import { fireEvent, screen } from '@testing-library/vue'
import { describe, expect, it } from 'vitest'

import { expectAccessible, renderWithApp } from '../../../tests/helpers'
import Button from './Button.vue'

describe('Button', () => {
  it('по умолчанию type=button (не отправляет форму случайно)', () => {
    renderWithApp(Button, { props: { label: 'demo.action' } })
    expect(screen.getByRole('button', { name: 'Действие' }).getAttribute('type')).toBe('button')
  })

  it('submit-кнопка отправляет форму', async () => {
    let submitted = false
    renderWithApp({
      components: { Button },
      template: `<form @submit.prevent="submit"><Button label="demo.action" type="submit" /></form>`,
      methods: {
        submit() {
          submitted = true
        },
      },
    })
    await fireEvent.click(screen.getByRole('button'))
    expect(submitted).toBe(true)
  })

  it('эмитит click', async () => {
    const { emitted } = renderWithApp(Button, { props: { label: 'demo.action' } })
    await fireEvent.click(screen.getByRole('button'))
    expect(emitted().click).toHaveLength(1)
  })

  it.each(['primary', 'secondary', 'ghost', 'danger', 'link'] as const)('вариант %s', (variant) => {
    renderWithApp(Button, { props: { label: 'demo.action', variant } })
    expect(screen.getByRole('button').classList).toContain(`ui-button--${variant}`)
  })

  it.each(['sm', 'md', 'lg'] as const)('размер %s и block', (size) => {
    renderWithApp(Button, { props: { label: 'demo.action', size, block: true } })
    const classes = screen.getByRole('button').classList
    expect(classes).toContain(`ui-button--${size}`)
    expect(classes).toContain('ui-button--block')
  })

  it('disabled: клики не проходят', async () => {
    const { emitted } = renderWithApp(Button, { props: { label: 'demo.action', disabled: true } })
    const button = screen.getByRole('button') as HTMLButtonElement
    expect(button.disabled).toBe(true)
    await fireEvent.click(button)
    expect(emitted().click).toBeUndefined()
  })

  it('loading: aria-busy, disabled, повторные клики игнорируются, текст остаётся', async () => {
    const { emitted } = renderWithApp(Button, { props: { label: 'demo.action', loading: true } })
    const button = screen.getByRole('button') as HTMLButtonElement
    expect(button.getAttribute('aria-busy')).toBe('true')
    expect(button.disabled).toBe(true)
    expect(button.textContent).toContain('Действие')
    expect(screen.getByRole('status')).toBeTruthy()
    await fireEvent.click(button)
    expect(emitted().click).toBeUndefined()
  })

  it('href рендерит ссылку', () => {
    renderWithApp(Button, { props: { label: 'demo.action', href: 'tel:+70000000000' } })
    const link = screen.getByRole('link', { name: 'Действие' })
    expect(link.getAttribute('href')).toBe('tel:+70000000000')
  })

  it('to рендерит RouterLink', () => {
    renderWithApp(Button, { props: { label: 'demo.action', to: '/privacy' } })
    expect(screen.getByRole('link').getAttribute('href')).toBe('/privacy')
  })

  it('отключённая ссылка получает aria-disabled и не эмитит click', async () => {
    const { emitted } = renderWithApp(Button, {
      props: { label: 'demo.action', href: '/x', disabled: true },
    })
    const link = screen.getByRole('link')
    expect(link.getAttribute('aria-disabled')).toBe('true')
    await fireEvent.click(link)
    expect(emitted().click).toBeUndefined()
  })

  it('iconOnly использует ariaLabel как имя', () => {
    renderWithApp(Button, { props: { iconOnly: 'x', ariaLabel: 'common.close' } })
    const button = screen.getByRole('button', { name: 'Закрыть' })
    expect(button.classList).toContain('ui-button--icon-only')
  })

  it('иконки до и после текста', () => {
    const { container } = renderWithApp(Button, {
      props: { label: 'demo.action', iconStart: 'phone', iconEnd: 'chevron-right' },
    })
    expect(container.querySelectorAll('svg')).toHaveLength(2)
  })

  it('доступна (обычная, loading, iconOnly)', async () => {
    const a = renderWithApp(Button, { props: { label: 'demo.action' } })
    await expectAccessible(a.container)
    const b = renderWithApp(Button, { props: { label: 'demo.action', loading: true } })
    await expectAccessible(b.container)
    const c = renderWithApp(Button, { props: { iconOnly: 'menu', ariaLabel: 'demo.menu' } })
    await expectAccessible(c.container)
  })
})
