<script setup lang="ts">
import { Container, DataTable, Heading, Section, Stack, Text } from '@app/ui'
import type { DataTableColumn, DataTableRow } from '@app/ui'

import siteConfig from '../../site.config'

const columns: DataTableColumn[] = [
  { key: 'title', label: 'site.prices.service' },
  { key: 'priceFrom', label: 'site.prices.price', align: 'end' },
]
const rows: DataTableRow[] = siteConfig.services.map((s) => ({
  slug: s.slug,
  title: s.title,
  priceFrom: s.priceFrom,
}))
const price = new Intl.NumberFormat('ru-RU')
</script>

<template>
  <Section id="prices" labelledby="prices-title">
    <Container size="lg">
      <Stack :gap="6">
        <Heading id="prices-title" k="site.prices.title" :level="2" />
        <DataTable :columns="columns" :rows="rows" row-key="slug" caption="site.prices.caption">
          <template #cell-title="{ value }">
            <Text :k="value as never" as="span" weight="medium" />
          </template>
          <template #cell-priceFrom="{ value }">
            <Text
              k="site.services.priceFrom"
              :args="{ price: price.format(value as number) }"
              as="span"
              weight="semibold"
            />
          </template>
        </DataTable>
        <Text k="site.prices.note" tone="muted" variant="body-sm" as="p" />
      </Stack>
    </Container>
  </Section>
</template>
