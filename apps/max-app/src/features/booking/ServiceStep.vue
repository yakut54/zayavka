<script setup lang="ts">
import { Button, Duration, EmptyState, Money, SelectableCard, Stack } from '@app/ui'
import { useI18n } from 'vue-i18n'

import { useMaxBridge } from '../../bridge/useMaxBridge'
import { useBookingDraft } from '../../stores/bookingDraft'
import { useBootstrap } from '../launch/useBootstrap'
import { useFlow } from './useFlow'

const { t } = useI18n()
const bridge = useMaxBridge()
const bootstrap = useBootstrap()
const draft = useBookingDraft()
const flow = useFlow()

async function pick(slug: string): Promise<void> {
  draft.setService(slug)
  bridge.haptic.selection()
  await flow.next('service')
}

const call = (): void => bridge.openLink(`tel:${bootstrap.value.business.phone}`)
</script>

<template>
  <EmptyState
    v-if="bootstrap.services.length === 0"
    title="miniapp.service.emptyTitle"
    description="miniapp.service.emptyText"
  >
    <Button label="miniapp.service.call" @click="call" />
  </EmptyState>
  <Stack v-else :gap="3" role="radiogroup" :aria-label="t('miniapp.steps.service')">
    <SelectableCard
      v-for="service in bootstrap.services"
      :key="service.slug"
      :model-value="draft.serviceSlug ?? undefined"
      :value="service.slug"
      :title="service.title"
      name="service"
      @update:model-value="pick"
    >
      <template #meta>
        <span class="service__meta">
          <Duration :minutes="service.duration_min" />
          <Money v-if="service.price_from !== null" :amount="service.price_from" from />
        </span>
      </template>
    </SelectableCard>
  </Stack>
</template>

<style scoped>
.service__meta {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: var(--space-1);
}
</style>
