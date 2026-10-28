import type { Meta, StoryObj } from '@storybook/vue3-vite'
import { ref } from 'vue'

import BottomBar from './BottomBar/BottomBar.vue'
import Button from './Button/Button.vue'
import DateStrip from './DateStrip/DateStrip.vue'
import DateTimeText from './DateTimeText/DateTimeText.vue'
import Duration from './Duration/Duration.vue'
import ListItem from './ListItem/ListItem.vue'
import Money from './Money/Money.vue'
import SelectableCard from './SelectableCard/SelectableCard.vue'
import SlotGrid from './SlotGrid/SlotGrid.vue'
import StepHeader from './StepHeader/StepHeader.vue'
import Tabs from './Tabs/Tabs.vue'
import TimeGrid, { type GridEvent } from './TimeGrid/TimeGrid.vue'
import TimeRangeInput from './TimeRangeInput/TimeRangeInput.vue'
import WeekScheduleEditor, { type WeekSchedule } from './WeekScheduleEditor/WeekScheduleEditor.vue'

const meta: Meta = {
  title: 'Запись/Компоненты',
  decorators: [
    () => ({ template: '<div style="max-width: 420px; padding: 16px"><story /></div>' }),
  ],
}
export default meta
type Story = StoryObj

export const Formatters: Story = {
  render: () => ({
    components: { Duration, Money, DateTimeText },
    template: `
      <div style="display: grid; gap: 8px">
        <Duration :minutes="45" /> <Duration :minutes="60" /> <Duration :minutes="90" />
        <Money :amount="1500" /> <Money :amount="2000" from />
        <DateTimeText value="2030-01-07T03:00:00Z" tz="Asia/Novosibirsk" />
        <DateTimeText value="2030-01-07T03:00:00Z" tz="Asia/Novosibirsk" format="weekday-date" />
        <DateTimeText value="2030-01-07T03:00:00Z" tz="Asia/Novosibirsk" format="time" />
      </div>`,
  }),
}

export const TabsDemo: Story = {
  name: 'Tabs',
  render: () => ({
    components: { Tabs },
    setup: () => ({
      active: ref('profile'),
      items: [
        { id: 'profile', label: 'demo.title' },
        { id: 'schedule', label: 'demo.label', badge: 3 },
        { id: 'exceptions', label: 'demo.action' },
      ],
    }),
    template: `
      <Tabs v-model="active" :items="items" label="demo.title">
        <template #profile><p>Профиль</p></template>
        <template #schedule><p>График</p></template>
        <template #exceptions><p>Исключения</p></template>
      </Tabs>`,
  }),
}

export const Steps: Story = {
  render: () => ({
    components: { StepHeader },
    template: `<div style="display: grid; gap: 24px"><StepHeader :step="1" :total="5" title="demo.title" /><StepHeader :step="4" :total="5" title="demo.label" /></div>`,
  }),
}

export const Cards: Story = {
  render: () => ({
    components: { SelectableCard },
    setup: () => ({ value: ref('a') }),
    template: `
      <div role="radiogroup" aria-label="Услуга" style="display: grid; gap: 8px">
        <SelectableCard v-model="value" name="svc" value="a" title="Шиномонтаж" subtitle="45 мин" meta="от 2 000 ₽" />
        <SelectableCard v-model="value" name="svc" value="b" title="Диагностика" subtitle="1 ч" meta="от 1 500 ₽" />
        <SelectableCard v-model="value" name="svc" value="c" title="Замена масла" subtitle="Недоступно" disabled />
      </div>`,
  }),
}

export const Dates: Story = {
  render: () => ({
    components: { DateStrip },
    setup: () => ({
      value: ref('2030-01-09'),
      days: Array.from({ length: 14 }, (_, i) => ({
        date: `2030-01-${String(7 + i).padStart(2, '0')}`,
        available: i % 4 !== 1,
      })),
    }),
    template: `<DateStrip v-model="value" :days="days" label="demo.label" />`,
  }),
}

export const Slots: Story = {
  render: () => ({
    components: { SlotGrid },
    setup: () => ({
      value: ref('10:30'),
      groups: [
        {
          label: 'Утро',
          slots: ['09:00', '09:30', '10:00', '10:30', '11:00', '11:30'].map((t) => ({
            value: t,
            label: t,
          })),
        },
        {
          label: 'День',
          slots: ['12:00', '13:30', '15:00'].map((t) => ({ value: t, label: t })),
        },
      ],
    }),
    template: `<SlotGrid v-model="value" :groups="groups" />`,
  }),
}

export const Bar: Story = {
  render: () => ({
    components: { BottomBar, Button },
    template: `
      <BottomBar>
        <template #secondary><Button label="common.cancel" variant="secondary" /></template>
        <template #primary><Button label="demo.action" block /></template>
      </BottomBar>`,
  }),
}

export const Rows: Story = {
  render: () => ({
    components: { ListItem },
    template: `
      <div>
        <ListItem title="Шиномонтаж" subtitle="Иван" meta="10:00" />
        <ListItem title="Диагностика" subtitle="Пётр" meta="12:00" interactive />
        <ListItem title="Политика" to="/privacy" />
      </div>`,
  }),
}

export const TimeRange: Story = {
  render: () => ({
    components: { TimeRangeInput },
    setup: () => ({
      ok: ref<[number, number]>([540, 780]),
      bad: ref<[number, number]>([780, 540]),
    }),
    template: `<div style="display: grid; gap: 12px"><TimeRangeInput v-model="ok" /><TimeRangeInput v-model="bad" /></div>`,
  }),
}

const week: WeekSchedule = {
  1: [
    [540, 780],
    [840, 1200],
  ],
  2: [[540, 1080]],
  3: [[540, 1080]],
  4: [[540, 1080]],
  5: [[540, 1080]],
  6: [[600, 900]],
  7: [],
}

export const Schedule: Story = {
  parameters: { layout: 'padded' },
  render: () => ({
    components: { WeekScheduleEditor },
    setup: () => ({ value: ref(week) }),
    template: `<WeekScheduleEditor v-model="value" />`,
  }),
}

const events: GridEvent[] = [
  {
    id: '1',
    columnId: 'a',
    startMin: 600,
    endMin: 645,
    bufferMin: 15,
    title: 'Шиномонтаж',
    subtitle: 'Анна',
    label: '10:00–10:45, Шиномонтаж, Анна',
  },
  {
    id: '2',
    columnId: 'a',
    startMin: 720,
    endMin: 780,
    bufferMin: 15,
    title: 'Диагностика',
    subtitle: 'Олег',
    label: '12:00–13:00, Диагностика, Олег',
    tone: 'success',
  },
  {
    id: '3',
    columnId: 'b',
    startMin: 660,
    endMin: 750,
    title: 'Масло',
    subtitle: 'Не пришёл',
    label: '11:00–12:30, Масло, Не пришёл',
    tone: 'danger',
  },
]

export const Grid: Story = {
  parameters: { layout: 'fullscreen' },
  render: () => ({
    components: { TimeGrid },
    setup: () => ({
      events,
      columns: [
        { id: 'a', title: 'Иван' },
        { id: 'b', title: 'Пётр' },
      ],
      off: [
        { columnId: 'a', startMin: 480, endMin: 540 },
        { columnId: 'b', startMin: 480, endMin: 600 },
        { columnId: 'b', startMin: 1080, endMin: 1140 },
      ],
    }),
    template: `<div style="padding: 16px"><TimeGrid :columns="columns" :start-min="480" :end-min="1140" :events="events" :unavailable="off" :now="690" /></div>`,
  }),
}
