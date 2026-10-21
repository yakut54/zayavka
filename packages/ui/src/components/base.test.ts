import { fireEvent, screen } from '@testing-library/vue'
import { describe, expect, it } from 'vitest'

import { expectAccessible, renderWithApp } from '../../tests/helpers'
import Badge from './Badge/Badge.vue'
import Divider from './Divider/Divider.vue'
import EmptyState from './EmptyState/EmptyState.vue'
import ErrorState from './ErrorState/ErrorState.vue'
import Icon from './Icon/Icon.vue'
import IconButton from './IconButton/IconButton.vue'
import Link from './Link/Link.vue'
import Skeleton from './Skeleton/Skeleton.vue'
import Spinner from './Spinner/Spinner.vue'
import VisuallyHidden from './VisuallyHidden/VisuallyHidden.vue'

describe('Icon', () => {
  it('без label скрыта от скринридеров', () => {
    const { container } = renderWithApp(Icon, { props: { name: 'phone' } })
    const svg = container.querySelector('svg') as SVGElement
    expect(svg.getAttribute('aria-hidden')).toBe('true')
    expect(svg.getAttribute('role')).toBeNull()
  })

  it('с label получает role=img и подпись', () => {
    renderWithApp(Icon, { props: { name: 'phone', label: 'common.close' } })
    expect(screen.getByRole('img', { name: 'Закрыть' })).toBeTruthy()
  })

  it.each(['sm', 'md', 'lg'] as const)('размер %s', (size) => {
    const { container } = renderWithApp(Icon, { props: { name: 'check', size } })
    expect(container.querySelector('svg')?.classList).toContain(`ui-icon--${size}`)
  })
})

describe('Spinner', () => {
  it('role=status с текстом для скринридеров', () => {
    renderWithApp(Spinner)
    expect(screen.getByRole('status').textContent).toContain('Загрузка')
  })

  it('принимает свой label и размер', async () => {
    const { container } = renderWithApp(Spinner, { props: { label: 'common.retry', size: 'lg' } })
    expect(container.textContent).toContain('Повторить')
    expect(container.querySelector('.ui-spinner__ring--lg')).not.toBeNull()
    await expectAccessible(container)
  })
})

describe('VisuallyHidden', () => {
  it('рендерит span и div', () => {
    const a = renderWithApp(VisuallyHidden, { slots: { default: 'скрыто' } })
    expect(a.container.querySelector('span.ui-visually-hidden')?.textContent).toBe('скрыто')
    const b = renderWithApp(VisuallyHidden, { props: { as: 'div' }, slots: { default: 'x' } })
    expect(b.container.querySelector('div.ui-visually-hidden')).not.toBeNull()
  })
})

describe('Link', () => {
  it('обычная ссылка', async () => {
    const { container } = renderWithApp(Link, { props: { k: 'demo.policyLink', href: '/privacy' } })
    const link = screen.getByRole('link', { name: 'политикой' })
    expect(link.getAttribute('href')).toBe('/privacy')
    expect(link.getAttribute('target')).toBeNull()
    await expectAccessible(container)
  })

  it('внешняя ссылка: noopener и скрытая подсказка про новую вкладку', () => {
    renderWithApp(Link, {
      props: { k: 'demo.policyLink', href: 'https://example.ru', external: true },
    })
    const link = screen.getByRole('link')
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toBe('noopener noreferrer')
    expect(link.textContent).toContain('откроется в новой вкладке')
  })

  it('to рендерит RouterLink', () => {
    renderWithApp(Link, { props: { k: 'demo.policyLink', to: '/privacy', tone: 'muted' } })
    const link = screen.getByRole('link')
    expect(link.getAttribute('href')).toBe('/privacy')
    expect(link.classList).toContain('ui-link--muted')
  })
})

describe('IconButton', () => {
  it('квадратная кнопка с подписью и пробросом атрибутов', async () => {
    const { emitted, container } = renderWithApp(IconButton, {
      props: { iconOnly: 'menu', ariaLabel: 'demo.menu' },
      attrs: { 'aria-expanded': 'false', 'aria-controls': 'nav' },
    })
    const button = screen.getByRole('button', { name: 'Меню' })
    expect(button.getAttribute('aria-expanded')).toBe('false')
    expect(button.getAttribute('aria-controls')).toBe('nav')
    expect(button.classList).toContain('ui-button--icon-only')
    await fireEvent.click(button)
    expect(emitted().click).toHaveLength(1)
    await expectAccessible(container)
  })
})

describe('Badge', () => {
  it.each(['neutral', 'accent', 'success', 'warning', 'danger', 'muted'] as const)(
    'тон %s',
    async (tone) => {
      const { container } = renderWithApp(Badge, { props: { k: 'demo.text', tone } })
      expect(container.querySelector(`.ui-badge--${tone}`)).not.toBeNull()
      await expectAccessible(container)
    },
  )

  it('поддерживает аргументы', () => {
    const { container } = renderWithApp(Badge, {
      props: { k: 'demo.greeting', args: { name: 'А' } },
    })
    expect(container.textContent).toBe('Здравствуйте, А!')
  })
})

describe('Skeleton', () => {
  it('скрыт от скринридеров и рисует нужное число строк', () => {
    const { container } = renderWithApp(Skeleton, { props: { lines: 3, height: '2rem' } })
    expect(container.firstElementChild?.getAttribute('aria-hidden')).toBe('true')
    const bars = container.querySelectorAll('.ui-skeleton__bar')
    expect(bars).toHaveLength(3)
    expect((bars[2] as HTMLElement).style.width).toBe('60%')
    expect((bars[0] as HTMLElement).style.height).toBe('2rem')
  })

  it('одна строка по умолчанию на всю ширину', () => {
    const { container } = renderWithApp(Skeleton)
    expect((container.querySelector('.ui-skeleton__bar') as HTMLElement).style.width).toBe('100%')
  })
})

describe('EmptyState', () => {
  it('заголовок, описание и действие', async () => {
    const { container } = renderWithApp(EmptyState, {
      props: { title: 'demo.emptyTitle', description: 'demo.emptyText' },
      slots: { default: '<button type="button">Добавить</button>' },
    })
    expect(container.textContent).toContain('Здесь пока пусто')
    expect(container.textContent).toContain('Добавьте первую запись')
    expect(screen.getByRole('button', { name: 'Добавить' })).toBeTruthy()
    await expectAccessible(container)
  })

  it('без описания и действия', () => {
    const { container } = renderWithApp(EmptyState, {
      props: { title: 'demo.emptyTitle', icon: 'search' },
    })
    expect(container.querySelector('.ui-empty__action')).toBeNull()
  })
})

describe('ErrorState', () => {
  it('показывает текст по коду и эмитит retry', async () => {
    const { emitted, container } = renderWithApp(ErrorState, { props: { code: 'network' } })
    expect(screen.getByRole('alert').textContent).toContain('Нет соединения с сервером')
    await fireEvent.click(screen.getByRole('button', { name: 'Повторить' }))
    expect(emitted().retry).toHaveLength(1)
    await expectAccessible(container)
  })

  it('неизвестный код → internal_error', () => {
    renderWithApp(ErrorState, { props: { code: 'wat' } })
    expect(screen.getByRole('alert').textContent).toContain('Что-то пошло не так')
  })

  it('без кода → internal_error', () => {
    renderWithApp(ErrorState)
    expect(screen.getByRole('alert').textContent).toContain('Что-то пошло не так')
  })
})

describe('Divider', () => {
  it('горизонтальный — hr, вертикальный — separator', () => {
    const a = renderWithApp(Divider)
    expect(a.container.querySelector('hr')).not.toBeNull()
    const b = renderWithApp(Divider, { props: { orientation: 'vertical' } })
    expect(b.container.querySelector('[role="separator"]')?.getAttribute('aria-orientation')).toBe(
      'vertical',
    )
  })
})
