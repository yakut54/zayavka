import { describe, expect, it } from 'vitest'

import { expectAccessible, renderWithApp } from '../../tests/helpers'
import Container from './Container/Container.vue'
import Grid from './Grid/Grid.vue'
import Inline from './Inline/Inline.vue'
import { space } from './layout/types'
import Section from './Section/Section.vue'
import Stack from './Stack/Stack.vue'
import Surface from './Surface/Surface.vue'

const slots = { default: '<p>Содержимое</p>' }

describe('layout', () => {
  it('space() даёт токен', () => {
    expect(space(4)).toBe('var(--space-4)')
  })

  it('Container: размер и тег', () => {
    const { container } = renderWithApp(Container, { props: { size: 'md', as: 'main' }, slots })
    const el = container.firstElementChild as HTMLElement
    expect(el.tagName).toBe('MAIN')
    expect(el.classList).toContain('ui-container--md')
  })

  it('Stack: gap из шкалы, выравнивание, тег', () => {
    const { container } = renderWithApp(Stack, {
      props: { gap: 8, align: 'center', as: 'ul' },
      slots,
    })
    const el = container.firstElementChild as HTMLElement
    expect(el.tagName).toBe('UL')
    expect(el.classList).toContain('ui-stack--gap-8')
    expect(el.classList).toContain('ui-stack--center')
  })

  it('Inline: gap, выравнивание, перенос', () => {
    const { container } = renderWithApp(Inline, {
      props: { gap: 2, align: 'baseline', justify: 'between', wrap: true },
      slots,
    })
    const el = container.firstElementChild as HTMLElement
    expect(el.classList).toContain('ui-inline--gap-2')
    expect(el.classList).toContain('ui-inline--wrap')
    expect(el.classList).toContain('ui-inline--justify-between')
    expect(el.classList).toContain('ui-inline--align-baseline')
  })

  it('Grid: колонки по брейкпоинтам', () => {
    const { container } = renderWithApp(Grid, {
      props: { cols: { base: 1, md: 2, lg: 3 }, gap: 6 },
      slots,
    })
    const el = container.firstElementChild as HTMLElement
    for (const cls of ['ui-grid--c-1', 'ui-grid--md-2', 'ui-grid--lg-3', 'ui-grid--gap-6']) {
      expect(el.classList).toContain(cls)
    }
  })

  it('Grid: пропущенные брейкпоинты наследуют предыдущие', () => {
    const { container } = renderWithApp(Grid, { props: { cols: { base: 2 } }, slots })
    const el = container.firstElementChild as HTMLElement
    expect(el.classList).toContain('ui-grid--md-2')
    expect(el.classList).toContain('ui-grid--lg-2')
  })

  it('Grid по умолчанию — одна колонка', () => {
    const { container } = renderWithApp(Grid, { slots })
    expect((container.firstElementChild as HTMLElement).classList).toContain('ui-grid--c-1')
  })

  it('Surface: отступ, радиус, тень, тон, рамка', () => {
    const { container } = renderWithApp(Surface, {
      props: {
        padding: 10,
        radius: 'sm',
        shadow: 'lg',
        tone: 'accent',
        bordered: false,
        as: 'section',
      },
      slots,
    })
    const el = container.firstElementChild as HTMLElement
    expect(el.tagName).toBe('SECTION')
    expect(el.classList).toContain('ui-surface--p-10')
    for (const cls of ['ui-surface--radius-sm', 'ui-surface--shadow-lg', 'ui-surface--accent']) {
      expect(el.classList).toContain(cls)
    }
    expect(el.classList).not.toContain('ui-surface--bordered')
  })

  it('Section: id, тон, отступы, aria-labelledby', async () => {
    const { container } = renderWithApp(Section, {
      props: { id: 'services', tone: 'muted', spacing: 'lg', labelledby: 'services-title' },
      slots: { default: '<h2 id="services-title">Услуги</h2>' },
    })
    const el = container.firstElementChild as HTMLElement
    expect(el.id).toBe('services')
    expect(el.getAttribute('aria-labelledby')).toBe('services-title')
    expect(el.classList).toContain('ui-section--muted')
    expect(el.classList).toContain('ui-section--lg')
    await expectAccessible(container)
  })
})
