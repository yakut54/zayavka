import { fireEvent, screen, within } from '@testing-library/vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useToast } from '../composables/useToast'
import { expectAccessible, renderWithApp } from '../../tests/helpers'
import Accordion from './Accordion/Accordion.vue'
import Alert from './Alert/Alert.vue'
import DataTable from './DataTable/DataTable.vue'
import Dialog from './Dialog/Dialog.vue'
import Drawer from './Drawer/Drawer.vue'
import Pagination from './Pagination/Pagination.vue'
import ToastRegion from './Toast/ToastRegion.vue'

describe('Alert', () => {
  it.each([
    ['info', 'status'],
    ['success', 'status'],
    ['warning', 'status'],
    ['danger', 'alert'],
  ] as const)('тон %s имеет role=%s', async (tone, role) => {
    const { container } = renderWithApp(Alert, { props: { tone, k: 'demo.text' } })
    expect(screen.getByRole(role).textContent).toContain('Образец текста')
    expect(container.querySelector(`.ui-alert--${tone}`)).not.toBeNull()
    await expectAccessible(container)
  })

  it('заголовок, аргументы и слот', () => {
    renderWithApp(Alert, {
      props: { title: 'demo.title', k: 'demo.greeting', args: { name: 'Анна' } },
      slots: { default: '<ul><li>Пункт</li></ul>' },
    })
    const alert = screen.getByRole('status')
    expect(alert.textContent).toContain('Заголовок')
    expect(alert.textContent).toContain('Здравствуйте, Анна!')
    expect(alert.textContent).toContain('Пункт')
  })

  it('dismissible эмитит dismiss', async () => {
    const { emitted } = renderWithApp(Alert, { props: { k: 'demo.text', dismissible: true } })
    await fireEvent.click(screen.getByRole('button', { name: 'Закрыть уведомление' }))
    expect(emitted().dismiss).toHaveLength(1)
  })

  it('без dismissible кнопки нет', () => {
    renderWithApp(Alert, { props: { k: 'demo.text' } })
    expect(screen.queryByRole('button')).toBeNull()
  })
})

describe('Toast', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    useToast().clear()
  })
  afterEach(() => {
    useToast().clear()
    vi.useRealTimers()
  })

  it('показывает уведомление в live-регионе', async () => {
    renderWithApp(ToastRegion)
    const region = screen.getByRole('region', { name: 'Уведомления' })
    expect(region.getAttribute('aria-live')).toBe('polite')
    useToast().success('demo.greeting', { name: 'Анна' })
    await vi.advanceTimersByTimeAsync(0)
    expect(region.textContent).toContain('Здравствуйте, Анна!')
  })

  it('автоскрытие: 5 с, ошибки — 8 с', async () => {
    renderWithApp(ToastRegion)
    const toast = useToast()
    toast.success('demo.text')
    toast.error('demo.title')
    await vi.advanceTimersByTimeAsync(4999)
    expect(toast.items.value).toHaveLength(2)
    await vi.advanceTimersByTimeAsync(1)
    expect(toast.items.value.map((t) => t.tone)).toEqual(['error'])
    await vi.advanceTimersByTimeAsync(2999)
    expect(toast.items.value).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(toast.items.value).toHaveLength(0)
  })

  it('пауза при наведении и продолжение после ухода курсора', async () => {
    renderWithApp(ToastRegion)
    const toast = useToast()
    toast.info('demo.text')
    await vi.advanceTimersByTimeAsync(3000)
    const el = document.querySelector('.ui-toast') as HTMLElement
    el.dispatchEvent(new MouseEvent('mouseenter'))
    await vi.advanceTimersByTimeAsync(10_000)
    expect(toast.items.value).toHaveLength(1)
    el.dispatchEvent(new MouseEvent('mouseleave'))
    await vi.advanceTimersByTimeAsync(1999)
    expect(toast.items.value).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(toast.items.value).toHaveLength(0)
  })

  it('пауза при фокусе', async () => {
    renderWithApp(ToastRegion)
    const toast = useToast()
    toast.warning('demo.text')
    await vi.advanceTimersByTimeAsync(0)
    const el = document.querySelector('.ui-toast') as HTMLElement
    el.dispatchEvent(new FocusEvent('focusin'))
    await vi.advanceTimersByTimeAsync(20_000)
    expect(toast.items.value).toHaveLength(1)
    el.dispatchEvent(new FocusEvent('focusout'))
    await vi.advanceTimersByTimeAsync(5000)
    expect(toast.items.value).toHaveLength(0)
  })

  it('кнопка закрытия', async () => {
    renderWithApp(ToastRegion)
    const toast = useToast()
    toast.success('demo.text')
    await vi.advanceTimersByTimeAsync(0)
    await fireEvent.click(screen.getByRole('button', { name: 'Закрыть уведомление' }))
    expect(toast.items.value).toHaveLength(0)
  })

  it('действие в уведомлении вызывает обработчик и закрывает его', async () => {
    renderWithApp(ToastRegion)
    const toast = useToast()
    const onClick = vi.fn()
    toast.error('demo.text', undefined, { action: { label: 'common.retry', onClick } })
    await vi.advanceTimersByTimeAsync(0)
    await fireEvent.click(screen.getByRole('button', { name: 'Повторить' }))
    expect(onClick).toHaveBeenCalledTimes(1)
    expect(toast.items.value).toHaveLength(0)
  })

  it('своя длительность', async () => {
    renderWithApp(ToastRegion)
    const toast = useToast()
    toast.info('demo.text', undefined, { duration: 1000 })
    await vi.advanceTimersByTimeAsync(1000)
    expect(toast.items.value).toHaveLength(0)
  })

  it('не рассыпается на паузе без активного таймера', async () => {
    renderWithApp(ToastRegion)
    useToast().info('demo.text', undefined, { duration: 100 })
    await vi.advanceTimersByTimeAsync(0)
    const el = document.querySelector('.ui-toast') as HTMLElement
    await vi.advanceTimersByTimeAsync(100)
    el.dispatchEvent(new MouseEvent('mouseenter'))
    expect(useToast().items.value).toHaveLength(0)
  })

  it('доступен', async () => {
    vi.useRealTimers()
    const { container } = renderWithApp(ToastRegion)
    useToast().success('demo.text')
    await new Promise((r) => setTimeout(r, 0))
    await expectAccessible(container)
  })
})

describe('Dialog', () => {
  const props = {
    open: false,
    title: 'demo.title',
    description: 'demo.dialogText',
    confirmLabel: 'demo.confirm',
  } as const

  it('закрыт: содержимого нет', () => {
    renderWithApp(Dialog, { props })
    expect(document.querySelector('.ui-dialog__panel')).toBeNull()
  })

  it('открывается через showModal и показывает заголовок и описание', async () => {
    const { rerender } = renderWithApp(Dialog, { props })
    await rerender({ open: true })
    const dialog = document.querySelector('dialog') as HTMLDialogElement
    expect(dialog.open).toBe(true)
    expect(dialog.getAttribute('aria-labelledby')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Заголовок' })).toBeTruthy()
    expect(dialog.textContent).toContain('Действие нельзя будет отменить')
  })

  it('закрывается при open=false', async () => {
    const { rerender } = renderWithApp(Dialog, { props: { ...props, open: true } })
    const dialog = document.querySelector('dialog') as HTMLDialogElement
    await rerender({ open: false })
    expect(dialog.open).toBe(false)
  })

  it('confirm и cancel', async () => {
    const { emitted } = renderWithApp(Dialog, { props: { ...props, open: true } })
    await fireEvent.click(screen.getByRole('button', { name: 'Подтвердить' }))
    expect(emitted().confirm).toHaveLength(1)
    await fireEvent.click(screen.getByRole('button', { name: 'Отмена' }))
    expect(emitted().cancel).toHaveLength(1)
    expect(emitted()['update:open']).toEqual([[false]])
  })

  it('Esc (событие cancel) закрывает диалог через состояние', async () => {
    const { emitted } = renderWithApp(Dialog, { props: { ...props, open: true } })
    const dialog = document.querySelector('dialog') as HTMLDialogElement
    const event = new Event('cancel', { cancelable: true })
    dialog.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
    expect(emitted().cancel).toHaveLength(1)
  })

  it('клик по подложке закрывает, клик по содержимому — нет', async () => {
    const { emitted } = renderWithApp(Dialog, { props: { ...props, open: true } })
    const dialog = document.querySelector('dialog') as HTMLDialogElement
    await fireEvent.click(screen.getByRole('heading'))
    expect(emitted().cancel).toBeUndefined()
    await fireEvent.click(dialog)
    expect(emitted().cancel).toHaveLength(1)
  })

  it('loading блокирует отмену', async () => {
    const { emitted } = renderWithApp(Dialog, { props: { ...props, open: true, loading: true } })
    const dialog = document.querySelector('dialog') as HTMLDialogElement
    dialog.dispatchEvent(new Event('cancel', { cancelable: true }))
    await fireEvent.click(dialog)
    expect(emitted().cancel).toBeUndefined()
    expect((screen.getByRole('button', { name: 'Отмена' }) as HTMLButtonElement).disabled).toBe(
      true,
    )
  })

  it('danger-тон и слот', async () => {
    renderWithApp(Dialog, {
      props: { ...props, open: true, tone: 'danger' },
      slots: { default: '<p>Дополнительно</p>' },
    })
    expect(screen.getByRole('button', { name: 'Подтвердить' }).classList).toContain(
      'ui-button--danger',
    )
    expect(screen.getByText('Дополнительно')).toBeTruthy()
  })

  it('доступен в открытом состоянии', async () => {
    const { container } = renderWithApp(Dialog, { props: { ...props, open: true } })
    await expectAccessible(container)
  })
})

describe('Drawer', () => {
  const props = { open: true, title: 'demo.title' } as const

  it('открыт: заголовок, содержимое, role dialog', () => {
    renderWithApp(Drawer, { props, slots: { default: '<p>Тело панели</p>' } })
    const dialog = document.querySelector('dialog') as HTMLDialogElement
    expect(dialog.open).toBe(true)
    expect(dialog.getAttribute('aria-labelledby')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Заголовок' })).toBeTruthy()
    expect(screen.getByText('Тело панели')).toBeTruthy()
  })

  it('аргументы заголовка и сторона', () => {
    renderWithApp(Drawer, {
      props: { open: true, title: 'demo.greeting', titleArgs: { name: 'Анна' }, side: 'start' },
    })
    expect(screen.getByRole('heading').textContent).toBe('Здравствуйте, Анна!')
    expect(document.querySelector('.ui-drawer--start')).not.toBeNull()
  })

  it('закрытие: крестик, Esc, подложка', async () => {
    const { emitted } = renderWithApp(Drawer, { props })
    await fireEvent.click(screen.getByRole('button', { name: 'Закрыть' }))
    const dialog = document.querySelector('dialog') as HTMLDialogElement
    dialog.dispatchEvent(new Event('cancel', { cancelable: true }))
    await fireEvent.click(dialog)
    expect(emitted().close).toHaveLength(3)
    expect(emitted()['update:open']).toHaveLength(3)
  })

  it('клик внутри панели не закрывает', async () => {
    const { emitted } = renderWithApp(Drawer, { props, slots: { default: '<p>Тело</p>' } })
    await fireEvent.click(screen.getByText('Тело'))
    expect(emitted().close).toBeUndefined()
  })

  it('закрывается при open=false', async () => {
    const { rerender } = renderWithApp(Drawer, { props })
    const dialog = document.querySelector('dialog') as HTMLDialogElement
    await rerender({ open: false })
    expect(dialog.open).toBe(false)
  })

  it('доступен', async () => {
    const { container } = renderWithApp(Drawer, { props, slots: { default: '<p>Тело</p>' } })
    await expectAccessible(container)
  })
})

describe('Accordion', () => {
  const items = [
    { id: 'q1', title: 'demo.faqQ1', body: 'demo.faqA1' },
    { id: 'q2', title: 'demo.faqQ2', body: 'demo.faqA2' },
  ] as const

  it('рендерит нативные details; раскрыт только выбранный', async () => {
    const { container } = renderWithApp(Accordion, { props: { items: [...items], openId: 'q1' } })
    const details = [...container.querySelectorAll('details')]
    expect(details.map((d) => d.open)).toEqual([true, false])
    expect(details[0]?.textContent).toContain('Ответ на первый вопрос')
    expect(details[0]?.getAttribute('name')).toBe(details[1]?.getAttribute('name'))
    await expectAccessible(container)
  })

  it('без openId всё свёрнуто', () => {
    const { container } = renderWithApp(Accordion, { props: { items: [...items] } })
    expect([...container.querySelectorAll('details')].some((d) => d.open)).toBe(false)
  })
})

describe('DataTable', () => {
  const columns = [
    { key: 'number', label: 'demo.colName', width: '5rem' },
    { key: 'name', label: 'demo.colValue', sortable: true },
    { key: 'extra', label: 'demo.label', align: 'end' as const },
  ]
  const rows = [
    { id: 1, number: 'A', name: 'Первая', extra: 'x' },
    { id: 2, number: 'B', name: 'Вторая', extra: 'y' },
  ]
  const base = { columns, rows, rowKey: 'id', caption: 'demo.title' } as const

  it('таблица со скрытой подписью, заголовками и строками', async () => {
    const { container } = renderWithApp(DataTable, { props: base })
    expect(screen.getByRole('table', { name: 'Заголовок' })).toBeTruthy()
    expect(screen.getAllByRole('columnheader')).toHaveLength(3)
    expect(screen.getAllByRole('row')).toHaveLength(3)
    expect(screen.getByText('Вторая')).toBeTruthy()
    expect(container.querySelector('td')?.getAttribute('data-label')).toBe('Название')
    await expectAccessible(container)
  })

  it('rowKey-функция и слот ячейки', () => {
    renderWithApp(DataTable, {
      props: { ...base, rowKey: (row: Record<string, unknown>) => `k${row.id}` },
      slots: { 'cell-name': '<template #cell-name="{ value }"><b>{{ value }}!</b></template>' },
    })
    expect(screen.getByText('Первая!')).toBeTruthy()
  })

  it('loading: скелетоны вместо строк, aria-busy', () => {
    const { container } = renderWithApp(DataTable, {
      props: { ...base, loading: true, skeletonRows: 4 },
    })
    expect(container.querySelectorAll('tbody tr')).toHaveLength(4)
    expect(container.querySelector('table')?.getAttribute('aria-busy')).toBe('true')
    expect(screen.queryByText('Первая')).toBeNull()
  })

  it('по умолчанию 10 строк-скелетонов', () => {
    const { container } = renderWithApp(DataTable, { props: { ...base, loading: true } })
    expect(container.querySelectorAll('tbody tr')).toHaveLength(10)
  })

  it('пустая таблица: текст по умолчанию и слот empty', () => {
    const a = renderWithApp(DataTable, { props: { ...base, rows: [] } })
    expect(a.container.textContent).toContain('Нет данных')
    const b = renderWithApp(DataTable, { props: { ...base, rows: [] }, slots: { empty: 'Пусто!' } })
    expect(b.container.textContent).toContain('Пусто!')
  })

  it('кликабельные строки: клик и Enter, tabindex', async () => {
    const { emitted } = renderWithApp(DataTable, { props: { ...base, clickable: true } })
    const row = screen.getAllByRole('row')[1] as HTMLElement
    expect(row.getAttribute('tabindex')).toBe('0')
    await fireEvent.click(row)
    await fireEvent.keyDown(row, { key: 'Enter' })
    expect(emitted()['row-click']).toHaveLength(2)
    expect(emitted()['row-click']?.[0]).toEqual([rows[0]])
  })

  it('без clickable строки не кликаются', async () => {
    const { emitted } = renderWithApp(DataTable, { props: base })
    const row = screen.getAllByRole('row')[1] as HTMLElement
    expect(row.getAttribute('tabindex')).toBeNull()
    await fireEvent.click(row)
    expect(emitted()['row-click']).toBeUndefined()
  })

  it('сортировка: aria-sort и событие', async () => {
    const { emitted, rerender } = renderWithApp(DataTable, { props: base })
    const header = screen.getByRole('columnheader', { name: 'Значение' })
    expect(header.getAttribute('aria-sort')).toBe('none')
    expect(
      screen.getByRole('columnheader', { name: 'Название' }).getAttribute('aria-sort'),
    ).toBeNull()
    await fireEvent.click(screen.getByRole('button', { name: 'Значение' }))
    expect(emitted().sort).toEqual([['name']])
    await rerender({ sort: { key: 'name', direction: 'asc' } })
    expect(header.getAttribute('aria-sort')).toBe('ascending')
    await rerender({ sort: { key: 'name', direction: 'desc' } })
    expect(header.getAttribute('aria-sort')).toBe('descending')
  })
})

describe('Pagination', () => {
  it('показывает диапазон и эмитит смену страницы', async () => {
    const { emitted, container } = renderWithApp(Pagination, {
      props: { page: 2, pageSize: 25, total: 340 },
    })
    expect(container.textContent).toContain('Показано 26–50 из 340')
    expect(screen.getByRole('button', { name: 'Страница 2' }).getAttribute('aria-current')).toBe(
      'page',
    )
    await fireEvent.click(screen.getByRole('button', { name: 'Вперёд' }))
    await fireEvent.click(screen.getByRole('button', { name: 'Назад' }))
    await fireEvent.click(screen.getByRole('button', { name: 'Страница 14' }))
    expect(emitted()['update:page']).toEqual([[3], [1], [14]])
    await expectAccessible(container)
  })

  it('кнопки «Назад»/«Вперёд» блокируются на краях', () => {
    const first = renderWithApp(Pagination, { props: { page: 1, pageSize: 25, total: 100 } })
    expect(
      (
        within(first.container as HTMLElement).getByRole('button', {
          name: 'Назад',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true)
    const last = renderWithApp(Pagination, { props: { page: 4, pageSize: 25, total: 100 } })
    expect(
      (
        within(last.container as HTMLElement).getByRole('button', {
          name: 'Вперёд',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true)
  })

  it('многоточия для длинных списков', () => {
    const { container } = renderWithApp(Pagination, {
      props: { page: 10, pageSize: 10, total: 300 },
    })
    const labels = [...container.querySelectorAll('.ui-pagination__page')].map((b) =>
      b.textContent?.trim(),
    )
    expect(labels).toEqual(['1', '9', '10', '11', '30'])
    expect(container.querySelectorAll('.ui-pagination__gap')).toHaveLength(2)
  })

  it('без многоточий для короткого списка', () => {
    const { container } = renderWithApp(Pagination, { props: { page: 2, pageSize: 10, total: 30 } })
    expect(container.querySelectorAll('.ui-pagination__gap')).toHaveLength(0)
  })

  it('одна страница: навигации нет, диапазон есть', () => {
    const { container } = renderWithApp(Pagination, { props: { page: 1, pageSize: 25, total: 10 } })
    expect(container.querySelector('nav')).toBeNull()
    expect(container.textContent).toContain('Показано 1–10 из 10')
  })

  it('пустой список: 0–0 из 0', () => {
    const { container } = renderWithApp(Pagination, { props: { page: 1, pageSize: 25, total: 0 } })
    expect(container.textContent).toContain('Показано 0–0 из 0')
  })

  it('клик по текущей странице ничего не эмитит', async () => {
    const { emitted } = renderWithApp(Pagination, { props: { page: 2, pageSize: 10, total: 30 } })
    await fireEvent.click(screen.getByRole('button', { name: 'Страница 2' }))
    expect(emitted()['update:page']).toBeUndefined()
  })
})
