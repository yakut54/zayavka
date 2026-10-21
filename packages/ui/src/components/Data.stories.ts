import type { Meta, StoryObj } from '@storybook/vue3-vite'
import { ref } from 'vue'

import DataTable from './DataTable/DataTable.vue'
import Pagination from './Pagination/Pagination.vue'

const meta: Meta = { title: 'Данные/Обзор' }
export default meta
type Story = StoryObj

const columns = [
  { key: 'number', label: 'demo.colName', width: '6rem' },
  { key: 'name', label: 'demo.colValue', sortable: true },
  { key: 'extra', label: 'demo.label', align: 'end' as const },
]
const rows = [
  { id: 1, number: 'A-1', name: 'Первая строка', extra: '1 500' },
  { id: 2, number: 'A-2', name: 'Вторая строка', extra: '2 000' },
  { id: 3, number: 'A-3', name: 'Третья строка', extra: '3 200' },
]

export const Table: Story = {
  render: () => ({
    components: { DataTable },
    setup: () => ({ columns, rows }),
    template: `<DataTable :columns="columns" :rows="rows" row-key="id" caption="demo.title" />`,
  }),
}

export const TableClickableSorted: Story = {
  render: () => ({
    components: { DataTable },
    setup: () => ({ columns, rows, sort: ref({ key: 'name', direction: 'asc' }) }),
    template: `<DataTable :columns="columns" :rows="rows" row-key="id" caption="demo.title" clickable :sort="sort" />`,
  }),
}

export const TableLoading: Story = {
  render: () => ({
    components: { DataTable },
    setup: () => ({ columns }),
    template: `<DataTable :columns="columns" :rows="[]" row-key="id" caption="demo.title" loading :skeleton-rows="5" />`,
  }),
}

export const TableEmpty: Story = {
  render: () => ({
    components: { DataTable },
    setup: () => ({ columns }),
    template: `<DataTable :columns="columns" :rows="[]" row-key="id" caption="demo.title" />`,
  }),
}

export const TableDark: Story = { ...Table, globals: { theme: 'dark' } }

export const TableMobile: Story = {
  ...Table,
  parameters: { viewport: { defaultViewport: 'mobile1' } },
  decorators: [() => ({ template: '<div style="max-width: 390px"><story /></div>' })],
}

export const PaginationMiddle: Story = {
  render: () => ({
    components: { Pagination },
    setup: () => ({ page: ref(10) }),
    template: `<Pagination v-model:page="page" :page-size="10" :total="300" />`,
  }),
}

export const PaginationFirst: Story = {
  render: () => ({
    components: { Pagination },
    setup: () => ({ page: ref(1) }),
    template: `<Pagination v-model:page="page" :page-size="25" :total="340" />`,
  }),
}

export const PaginationSinglePage: Story = {
  render: () => ({
    components: { Pagination },
    template: `<Pagination :page="1" :page-size="25" :total="10" />`,
  }),
}
