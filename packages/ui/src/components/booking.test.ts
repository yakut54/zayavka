import { fireEvent, screen } from '@testing-library/vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, nextTick, ref } from 'vue'

import { expectAccessible, renderWithApp } from '../../tests/helpers'
import BottomBar from './BottomBar/BottomBar.vue'
import DateStrip, { type DayItem } from './DateStrip/DateStrip.vue'
import DateTimeText from './DateTimeText/DateTimeText.vue'
import Duration from './Duration/Duration.vue'
import ListItem from './ListItem/ListItem.vue'
import Money from './Money/Money.vue'
import SelectableCard from './SelectableCard/SelectableCard.vue'
import SlotGrid, { type SlotGroup } from './SlotGrid/SlotGrid.vue'
import StepHeader from './StepHeader/StepHeader.vue'
import Tabs, { type TabItem } from './Tabs/Tabs.vue'
import TimeGrid, { type GridEvent } from './TimeGrid/TimeGrid.vue'
import TimeRangeInput from './TimeRangeInput/TimeRangeInput.vue'
import WeekScheduleEditor, { type WeekSchedule } from './WeekScheduleEditor/WeekScheduleEditor.vue'

afterEach(() => vi.restoreAllMocks())

describe('Duration', () => {
  it.each([
    [0, '0 мин'],
    [45, '45 мин'],
    [60, '1 ч'],
    [90, '1 ч 30 мин'],
    [120, '2 ч'],
  ])('%i мин → %s', (minutes, expected) => {
    const { container } = renderWithApp(Duration, { props: { minutes } })
    expect(container.textContent).toBe(expected)
  })
})

describe('Money', () => {
  it('рубли без копеек с неразрывными пробелами', () => {
    const { container } = renderWithApp(Money, { props: { amount: 1500 } })
    expect(container.textContent?.replace(/\s/g, ' ')).toBe('1 500 ₽')
  })

  it('«от» перед суммой', () => {
    const { container } = renderWithApp(Money, { props: { amount: 2000, from: true } })
    expect(container.textContent?.replace(/\s/g, ' ')).toBe('от 2 000 ₽')
  })
})

describe('DateTimeText', () => {
  const value = '2030-01-07T03:00:00Z' // 10:00 в Новосибирске

  it.each([
    ['time', '10:00'],
    ['date', '7 января'],
  ] as const)('формат %s в поясе бизнеса', (format, expected) => {
    const { container } = renderWithApp(DateTimeText, {
      props: { value, format, tz: 'Asia/Novosibirsk' },
    })
    expect(container.textContent).toContain(expected)
    expect(container.querySelector('time')?.getAttribute('datetime')).toBe(
      '2030-01-07T03:00:00.000Z',
    )
  })

  it('день недели и дата, дата со временем', () => {
    const weekday = renderWithApp(DateTimeText, {
      props: { value: new Date(value), format: 'weekday-date', tz: 'Asia/Novosibirsk' },
    })
    expect(weekday.container.textContent).toBe('понедельник, 7 января')
    const both = renderWithApp(DateTimeText, { props: { value, tz: 'Asia/Novosibirsk' } })
    expect(both.container.textContent).toMatch(/7 января.*10:00/)
  })

  it('некорректная дата не ломает страницу', () => {
    const { container } = renderWithApp(DateTimeText, { props: { value: 'нет' } })
    expect(container.textContent).toBe('')
    expect(container.querySelector('time')?.hasAttribute('datetime')).toBe(false)
  })
})

describe('Tabs', () => {
  const items: TabItem[] = [
    { id: 'profile', label: 'demo.title' },
    { id: 'schedule', label: 'demo.label', badge: 3 },
    { id: 'extra', label: 'demo.action' },
  ]

  function mount(modelValue = 'profile') {
    const onUpdate = vi.fn()
    const result = renderWithApp(Tabs, {
      props: { items, modelValue, label: 'demo.title', 'onUpdate:modelValue': onUpdate },
      slots: { profile: '<p>Профиль</p>', schedule: '<p>График</p>', extra: '<p>Ещё</p>' },
    })
    return { ...result, onUpdate }
  }

  it('роли и связи ARIA, виден только панель выбранной вкладки', async () => {
    const { container } = mount()
    const tabs = screen.getAllByRole('tab')
    expect(tabs.map((t) => t.getAttribute('aria-selected'))).toEqual(['true', 'false', 'false'])
    expect(tabs.map((t) => t.getAttribute('tabindex'))).toEqual(['0', '-1', '-1'])
    const panel = screen.getByRole('tabpanel')
    expect(panel.getAttribute('aria-labelledby')).toBe(tabs[0]?.id)
    expect(tabs[0]?.getAttribute('aria-controls')).toBe(panel.id)
    expect(screen.queryByText('График')).toBeNull()
    expect(screen.getByText('3')).toBeTruthy()
    await expectAccessible(container)
  })

  it('клик выбирает вкладку', async () => {
    const { onUpdate } = mount()
    await fireEvent.click(screen.getAllByRole('tab')[1] as HTMLElement)
    expect(onUpdate).toHaveBeenCalledWith('schedule')
  })

  it.each([
    ['ArrowRight', 'profile', 'schedule'],
    ['ArrowLeft', 'profile', 'extra'],
    ['End', 'profile', 'extra'],
    ['Home', 'extra', 'profile'],
  ])('%s с вкладки %s → %s и фокус', async (key, from, to) => {
    const { onUpdate } = mount(from)
    const selected = screen
      .getAllByRole('tab')
      .find((t) => t.getAttribute('aria-selected') === 'true')
    await fireEvent.keyDown(selected as HTMLElement, { key })
    expect(onUpdate).toHaveBeenCalledWith(to)
  })

  it('другие клавиши игнорируются', async () => {
    const { onUpdate } = mount()
    await fireEvent.keyDown(screen.getAllByRole('tab')[0] as HTMLElement, { key: 'a' })
    expect(onUpdate).not.toHaveBeenCalled()
  })
})

describe('StepHeader', () => {
  it('прогресс и заголовок шага', async () => {
    const { container } = renderWithApp(StepHeader, {
      props: { step: 2, total: 5, title: 'demo.title' },
    })
    const bar = screen.getByRole('progressbar')
    expect(bar.getAttribute('aria-valuenow')).toBe('2')
    expect(bar.getAttribute('aria-valuemax')).toBe('5')
    expect(bar.getAttribute('aria-label')).toBe('Шаг 2 из 5')
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('Заголовок')
    await expectAccessible(container)
  })
})

describe('SelectableCard', () => {
  const Group = defineComponent({
    components: { SelectableCard },
    setup: () => ({ value: ref('a') }),
    template: `
      <div role="radiogroup" aria-label="Выбор">
        <SelectableCard v-model="value" value="a" title="Стрижка" subtitle="Мастер" meta="от 500" name="g" />
        <SelectableCard v-model="value" value="b" title="Борода" name="g" disabled />
        <SelectableCard v-model="value" value="c" title="Укладка" name="g"><template #meta>слот</template></SelectableCard>
        <output>{{ value }}</output>
      </div>`,
  })

  it('нативные радиокнопки: выбор, disabled и слот meta', async () => {
    const { container } = renderWithApp(Group)
    const radios = screen.getAllByRole('radio') as HTMLInputElement[]
    expect(radios.map((r) => r.checked)).toEqual([true, false, false])
    expect(radios[1]?.disabled).toBe(true)
    expect(screen.getByText('слот')).toBeTruthy()
    await fireEvent.click(radios[2] as HTMLElement)
    await nextTick()
    expect(container.querySelector('output')?.textContent).toBe('c')
    await expectAccessible(container)
  })

  it('без name создаёт собственное имя группы', () => {
    renderWithApp(SelectableCard, { props: { value: 'x', title: 'Один' } })
    expect((screen.getByRole('radio') as HTMLInputElement).name).not.toBe('')
  })
})

describe('DateStrip', () => {
  const days: DayItem[] = [
    { date: '2030-01-07', available: true },
    { date: '2030-01-08', available: false },
    { date: '2030-01-09', available: true },
    { date: '2030-01-10', available: true },
  ]

  function mount(modelValue?: string) {
    const onUpdate = vi.fn()
    const onReach = vi.fn()
    const result = renderWithApp(DateStrip, {
      props: {
        days,
        modelValue,
        label: 'demo.label',
        'onUpdate:modelValue': onUpdate,
        'onReach-end': onReach,
      },
    })
    return { ...result, onUpdate, onReach }
  }

  it('listbox с подписанными днями, недоступный день помечен', async () => {
    const { container } = mount('2030-01-09')
    expect(screen.getByRole('listbox').getAttribute('aria-label')).toBe('Подпись')
    const options = screen.getAllByRole('option')
    expect(options[0]?.getAttribute('aria-label')).toBe('пн 7, понедельник, 7 января')
    expect(options.map((o) => o.getAttribute('aria-selected'))).toEqual([
      'false',
      'false',
      'true',
      'false',
    ])
    expect(options[1]?.getAttribute('aria-disabled')).toBe('true')
    expect(options.map((o) => o.getAttribute('tabindex'))).toEqual(['-1', '-1', '0', '-1'])
    await expectAccessible(container)
  })

  it('без выбора в фокусе первый доступный день', () => {
    mount()
    expect(screen.getAllByRole('option')[0]?.getAttribute('tabindex')).toBe('0')
  })

  it('недоступный день не выбирается, доступный — выбирается', async () => {
    const { onUpdate } = mount()
    const options = screen.getAllByRole('option')
    await fireEvent.click(options[1] as HTMLElement)
    expect(onUpdate).not.toHaveBeenCalled()
    await fireEvent.click(options[2] as HTMLElement)
    expect(onUpdate).toHaveBeenCalledWith('2030-01-09')
  })

  it('стрелки пропускают недоступные дни', async () => {
    const { onReach } = mount('2030-01-07')
    const options = screen.getAllByRole('option')
    const focus = options.map((o) => vi.spyOn(o, 'focus'))
    await fireEvent.keyDown(options[0] as HTMLElement, { key: 'ArrowRight' })
    expect(focus[2]).toHaveBeenCalled()
    await fireEvent.keyDown(options[2] as HTMLElement, { key: 'ArrowLeft' })
    expect(focus[0]).toHaveBeenCalled()
    await fireEvent.keyDown(options[0] as HTMLElement, { key: 'End' })
    expect(focus[3]).toHaveBeenCalled()
    await fireEvent.keyDown(options[3] as HTMLElement, { key: 'Home' })
    await fireEvent.keyDown(options[3] as HTMLElement, { key: 'ArrowRight' })
    expect(onReach).toHaveBeenCalledTimes(1)
  })

  it('прокрутка до конца сообщает reach-end', async () => {
    const { onReach } = mount()
    const list = screen.getByRole('listbox')
    Object.defineProperties(list, {
      scrollLeft: { value: 100, configurable: true },
      clientWidth: { value: 200, configurable: true },
      scrollWidth: { value: 600, configurable: true },
    })
    await fireEvent.scroll(list)
    expect(onReach).not.toHaveBeenCalled()
    Object.defineProperty(list, 'scrollLeft', { value: 400, configurable: true })
    await fireEvent.scroll(list)
    expect(onReach).toHaveBeenCalledTimes(1)
  })
})

describe('SlotGrid', () => {
  const groups: SlotGroup[] = [
    {
      label: 'Утро',
      slots: [
        { value: '09:00', label: '09:00' },
        { value: '09:30', label: '09:30' },
      ],
    },
    { label: 'День', slots: [{ value: '13:00', label: '13:00' }] },
  ]

  function mount(modelValue?: string) {
    const onUpdate = vi.fn()
    const result = renderWithApp(SlotGrid, {
      props: { groups, modelValue, 'onUpdate:modelValue': onUpdate },
    })
    return { ...result, onUpdate }
  }

  it('радиогруппа на каждую группу времени', async () => {
    const { container } = mount('09:30')
    const radios = screen.getAllByRole('radio')
    expect(radios.map((r) => r.getAttribute('aria-checked'))).toEqual(['false', 'true', 'false'])
    expect(radios.map((r) => r.getAttribute('tabindex'))).toEqual(['-1', '0', '-1'])
    expect(screen.getAllByRole('radiogroup')).toHaveLength(2)
    expect(screen.getByRole('radiogroup', { name: 'Утро' })).toBeTruthy()
    await expectAccessible(container)
  })

  it('без выбора в фокусе первое время', () => {
    mount()
    expect(screen.getAllByRole('radio')[0]?.getAttribute('tabindex')).toBe('0')
  })

  it('клик и стрелки выбирают время по кругу в пределах группы', async () => {
    const { onUpdate } = mount('09:00')
    const radios = screen.getAllByRole('radio')
    await fireEvent.click(radios[1] as HTMLElement)
    expect(onUpdate).toHaveBeenLastCalledWith('09:30')
    await fireEvent.keyDown(radios[0] as HTMLElement, { key: 'ArrowRight' })
    expect(onUpdate).toHaveBeenLastCalledWith('09:30')
    await fireEvent.keyDown(radios[0] as HTMLElement, { key: 'ArrowLeft' })
    expect(onUpdate).toHaveBeenLastCalledWith('09:30')
    await fireEvent.keyDown(radios[2] as HTMLElement, { key: 'ArrowDown' })
    expect(onUpdate).toHaveBeenLastCalledWith('13:00')
    onUpdate.mockClear()
    await fireEvent.keyDown(radios[0] as HTMLElement, { key: 'Enter' })
    expect(onUpdate).not.toHaveBeenCalled()
  })
})

describe('BottomBar', () => {
  it('основное и дополнительное действия', async () => {
    const { container } = renderWithApp(BottomBar, {
      slots: {
        primary: '<button type="button">Записаться</button>',
        secondary: '<button type="button">Назад</button>',
      },
    })
    expect(screen.getByRole('button', { name: 'Записаться' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Назад' })).toBeTruthy()
    await expectAccessible(container)
  })

  it('без secondary не рисует пустую область', () => {
    const { container } = renderWithApp(BottomBar, {
      slots: { primary: '<button type="button">Ок</button>' },
    })
    expect(container.querySelector('.ui-bottom-bar__secondary')).toBeNull()
  })

  it('тень появляется, когда контент уходит под панель', async () => {
    let callback: (entries: Partial<IntersectionObserverEntry>[]) => void = () => undefined
    const disconnect = vi.fn()
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(cb: typeof callback) {
          callback = cb
        }
        observe = vi.fn()
        disconnect = disconnect
      },
    )
    const { container, unmount } = renderWithApp(BottomBar, {
      slots: { primary: '<button type="button">Ок</button>' },
    })
    const bar = container.querySelector('.ui-bottom-bar') as HTMLElement
    callback([{ isIntersecting: false }])
    await nextTick()
    expect(bar.classList).toContain('ui-bottom-bar--elevated')
    callback([{ isIntersecting: true }])
    await nextTick()
    expect(bar.classList).not.toContain('ui-bottom-bar--elevated')
    callback([])
    unmount()
    expect(disconnect).toHaveBeenCalled()
    vi.unstubAllGlobals()
  })
})

describe('ListItem', () => {
  it('без действий — обычная строка', async () => {
    const { container } = renderWithApp(ListItem, {
      props: { title: 'Стрижка', subtitle: 'Иван', meta: '10:00' },
    })
    expect(container.querySelector('button, a')).toBeNull()
    expect(container.textContent).toContain('10:00')
    await expectAccessible(container)
  })

  it('interactive — кнопка с событием click', async () => {
    const onClick = vi.fn()
    renderWithApp(ListItem, { props: { title: 'Стрижка', interactive: true, onClick } })
    await fireEvent.click(screen.getByRole('button'))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('to — ссылка на маршрут; слоты leading и meta', async () => {
    const { container } = renderWithApp(ListItem, {
      props: { title: 'Политика', to: '/privacy' },
      slots: { leading: '<i data-testid="lead" />', meta: '<b>новое</b>' },
    })
    expect(screen.getByRole('link').getAttribute('href')).toBe('/privacy')
    expect(screen.getByTestId('lead')).toBeTruthy()
    expect(screen.getByText('новое')).toBeTruthy()
    await expectAccessible(container)
  })
})

describe('TimeRangeInput', () => {
  function mount(modelValue: [number, number], extra: Record<string, unknown> = {}) {
    const onUpdate = vi.fn()
    const result = renderWithApp(TimeRangeInput, {
      props: { modelValue, 'onUpdate:modelValue': onUpdate, ...extra },
    })
    return { ...result, onUpdate }
  }

  it('показывает время и меняет начало и конец', async () => {
    const { container, onUpdate } = mount([540, 780])
    const start = screen.getByLabelText('Начало') as HTMLInputElement
    const end = screen.getByLabelText('Конец') as HTMLInputElement
    expect([start.value, end.value]).toEqual(['09:00', '13:00'])
    await fireEvent.update(start, '10:30')
    expect(onUpdate).toHaveBeenLastCalledWith([630, 780])
    await fireEvent.update(end, '18:15')
    expect(onUpdate).toHaveBeenLastCalledWith([540, 1095])
    await expectAccessible(container)
  })

  it('полночь в конце — 24:00 (1440)', async () => {
    const { onUpdate } = mount([540, 1440])
    const end = screen.getByLabelText('Конец') as HTMLInputElement
    expect(end.value).toBe('00:00')
    await fireEvent.update(end, '00:00')
    expect(onUpdate).toHaveBeenLastCalledWith([540, 1440])
  })

  it('пустое значение не сообщается наружу', async () => {
    const { onUpdate } = mount([540, 780])
    await fireEvent.update(screen.getByLabelText('Начало'), '')
    expect(onUpdate).not.toHaveBeenCalled()
  })

  it.each([[[780, 540]], [[540, 540]], [[541, 600]]] as [[number, number]][])(
    'помечает невалидный интервал %j',
    (value) => {
      mount(value)
      expect(screen.getByLabelText('Начало').getAttribute('aria-invalid')).toBe('true')
    },
  )

  it('invalid и disabled передаются в поля', () => {
    mount([540, 600], { invalid: true, disabled: true })
    const start = screen.getByLabelText('Начало') as HTMLInputElement
    expect(start.getAttribute('aria-invalid')).toBe('true')
    expect(start.disabled).toBe(true)
  })
})

describe('WeekScheduleEditor', () => {
  const base = (): WeekSchedule => ({
    1: [[540, 780]],
    2: [],
    3: [],
    4: [],
    5: [],
    6: [],
    7: [],
  })

  function mount(value: WeekSchedule = base(), extra: Record<string, unknown> = {}) {
    const onUpdate = vi.fn()
    const onValid = vi.fn()
    const result = renderWithApp(WeekScheduleEditor, {
      props: {
        modelValue: value,
        'onUpdate:modelValue': onUpdate,
        'onUpdate:valid': onValid,
        ...extra,
      },
    })
    return { ...result, onUpdate, onValid }
  }

  const last = (fn: ReturnType<typeof vi.fn>) => fn.mock.calls.at(-1)?.[0] as WeekSchedule

  it('семь дней, выходные отмечены, график доступен', async () => {
    const { container, onValid } = mount()
    expect(screen.getAllByRole('group')).toHaveLength(7)
    expect(screen.getByText('Понедельник')).toBeTruthy()
    const boxes = screen.getAllByRole('checkbox') as HTMLInputElement[]
    expect(boxes.map((b) => b.checked)).toEqual([true, false, false, false, false, false, false])
    expect(screen.getAllByText('Выходной')).toHaveLength(6)
    expect(onValid).toHaveBeenLastCalledWith(true)
    await expectAccessible(container)
  })

  it('включение дня ставит интервал по умолчанию, выключение очищает', async () => {
    const { onUpdate } = mount()
    const boxes = screen.getAllByRole('checkbox')
    await fireEvent.click(boxes[1] as HTMLElement)
    expect(last(onUpdate)[2]).toEqual([[540, 1080]])
    expect(last(onUpdate)[1]).toEqual([[540, 780]])
    await fireEvent.click(boxes[0] as HTMLElement)
    expect(last(onUpdate)[1]).toEqual([])
  })

  it('добавление и удаление интервала', async () => {
    const { onUpdate } = mount()
    await fireEvent.click(screen.getByRole('button', { name: 'Добавить интервал' }))
    expect(last(onUpdate)[1]).toEqual([
      [540, 780],
      [780, 900],
    ])
    await fireEvent.click(screen.getByRole('button', { name: 'Удалить интервал' }))
    expect(last(onUpdate)[1]).toEqual([])
  })

  it('нельзя добавить интервал после полуночи', () => {
    mount({ ...base(), 1: [[0, 1440]] })
    expect(
      (screen.getByRole('button', { name: 'Добавить интервал' }) as HTMLButtonElement).disabled,
    ).toBe(true)
  })

  it('изменение времени интервала', async () => {
    const { onUpdate } = mount()
    await fireEvent.update(screen.getByLabelText('Начало'), '10:00')
    expect(last(onUpdate)[1]).toEqual([[600, 780]])
  })

  it('копирует понедельник на будни', async () => {
    const { onUpdate } = mount()
    await fireEvent.click(screen.getByRole('button', { name: 'Скопировать понедельник на будни' }))
    const next = last(onUpdate)
    expect([2, 3, 4, 5].map((d) => next[d])).toEqual(Array(4).fill([[540, 780]]))
    expect(next[6]).toEqual([])
  })

  it('сбрасывает к исходному или к baseline', async () => {
    const edited: WeekSchedule = { ...base(), 3: [[600, 700]] }
    const { onUpdate } = mount(edited)
    await fireEvent.click(screen.getByRole('button', { name: 'Сбросить изменения' }))
    expect(last(onUpdate)[3]).toEqual([[600, 700]])
    onUpdate.mockClear()
    document.body.innerHTML = ''
    const second = mount(edited, { baseline: base() })
    await fireEvent.click(screen.getByRole('button', { name: 'Сбросить изменения' }))
    expect(last(second.onUpdate)[3]).toEqual([])
  })

  it.each([
    ['конец раньше начала', [[780, 540]], 'Начало должно быть раньше конца'],
    [
      'пересечение',
      [
        [540, 700],
        [650, 800],
      ],
      'Интервалы пересекаются',
    ],
    ['шаг', [[541, 600]], 'Время должно быть кратно 5 минутам'],
  ] as [string, [number, number][], string][])('ошибка: %s', async (_name, intervals, message) => {
    const { onValid } = mount({ ...base(), 1: intervals })
    expect(screen.getByRole('alert').textContent).toBe(message)
    expect(onValid).toHaveBeenLastCalledWith(false)
  })

  it('соприкасающиеся интервалы допустимы', () => {
    const { onValid } = mount({
      ...base(),
      1: [
        [540, 700],
        [700, 800],
      ],
    })
    expect(screen.queryByRole('alert')).toBeNull()
    expect(onValid).toHaveBeenLastCalledWith(true)
  })
})

describe('TimeGrid', () => {
  const columns = [
    { id: 'a', title: 'Иван' },
    { id: 'b', title: 'Пётр' },
  ]
  const events: GridEvent[] = [
    {
      id: 'e1',
      columnId: 'a',
      startMin: 600,
      endMin: 660,
      bufferMin: 15,
      title: 'Стрижка',
      subtitle: 'Анна',
      label: '10:00–11:00, Стрижка, Анна',
      tone: 'success',
    },
    {
      id: 'e2',
      columnId: 'b',
      startMin: 720,
      endMin: 765,
      title: 'Шиномонтаж',
      label: '12:00–12:45, Шиномонтаж, Олег',
    },
  ]

  function mount(extra: Record<string, unknown> = {}) {
    const onEvent = vi.fn()
    const onCell = vi.fn()
    const result = renderWithApp(TimeGrid, {
      props: {
        columns,
        startMin: 540,
        endMin: 1080,
        events,
        unavailable: [{ columnId: 'a', startMin: 540, endMin: 570 }],
        'onSelect-event': onEvent,
        'onSelect-cell': onCell,
        ...extra,
      },
    })
    return { ...result, onEvent, onCell }
  }

  it('колонки, подписанные события, нерабочее время и метки часов', async () => {
    const { container } = mount()
    expect(screen.getByText('Иван')).toBeTruthy()
    expect(screen.getByRole('button', { name: '10:00–11:00, Стрижка, Анна' })).toBeTruthy()
    expect(container.querySelectorAll('.ui-timegrid__off')).toHaveLength(1)
    expect(container.querySelectorAll('.ui-timegrid__buffer')).toHaveLength(1)
    expect(container.querySelectorAll('.ui-timegrid__hour')).toHaveLength(9)
    expect(container.querySelector('.ui-timegrid__now')).toBeNull()
    await expectAccessible(container)
  })

  it('клик по записи', async () => {
    const { onEvent } = mount()
    await fireEvent.click(screen.getByRole('button', { name: /Шиномонтаж/ }))
    expect(onEvent).toHaveBeenCalledWith('e2')
  })

  it('клик по свободной ячейке даёт колонку и время', async () => {
    const { container, onCell } = mount()
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      top: 100,
      height: 360, // 36 строк по 15 минут → 10 пикселей на строку
    } as DOMRect)
    const tracks = container.querySelectorAll('.ui-timegrid__track')
    await fireEvent.click(tracks[1] as HTMLElement, { clientY: 135 })
    expect(onCell).toHaveBeenLastCalledWith({ columnId: 'b', minute: 540 + 3 * 15 })
    await fireEvent.click(tracks[0] as HTMLElement, { clientY: 9999 })
    expect(onCell).toHaveBeenLastCalledWith({ columnId: 'a', minute: 540 + 35 * 15 })
    await fireEvent.click(tracks[0] as HTMLElement, { clientY: 0 })
    expect(onCell).toHaveBeenLastCalledWith({ columnId: 'a', minute: 540 })
  })

  it('клик по самой записи не считается кликом по ячейке', async () => {
    const { onCell } = mount()
    await fireEvent.click(screen.getByRole('button', { name: /Стрижка/ }))
    expect(onCell).not.toHaveBeenCalled()
  })

  it('без размеров (нулевая высота) берёт начало диапазона', async () => {
    const { container, onCell } = mount()
    await fireEvent.click(container.querySelector('.ui-timegrid__track') as HTMLElement)
    expect(onCell).toHaveBeenLastCalledWith({ columnId: 'a', minute: 540 })
  })

  it('линия «сейчас» только внутри диапазона', () => {
    const inside = mount({ now: 600 })
    expect(screen.getByRole('separator', { name: 'Сейчас' })).toBeTruthy()
    inside.unmount()
    mount({ now: 1200 })
    expect(screen.queryByRole('separator')).toBeNull()
  })

  it('слот события заменяет содержимое', () => {
    renderWithApp(TimeGrid, {
      props: { columns, startMin: 540, endMin: 1080, events },
      slots: { event: '<template #event="{ event }"><i>слот {{ event.id }}</i></template>' },
    })
    expect(screen.getByText('слот e1')).toBeTruthy()
  })
})
