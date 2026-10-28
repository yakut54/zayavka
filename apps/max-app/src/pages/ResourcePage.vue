<script setup lang="ts">
import { SelectableCard, Stack } from '@app/ui'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import { useMaxBridge } from '../bridge/useMaxBridge'
import StepLayout from '../features/booking/StepLayout.vue'
import { useFlow } from '../features/booking/useFlow'
import { useBookingDraft } from '../stores/bookingDraft'

const { t } = useI18n()
const bridge = useMaxBridge()
const draft = useBookingDraft()
const flow = useFlow()
const router = useRouter()

if (!draft.serviceSlug) void router.replace({ name: 'home' })

async function pick(choice: string): Promise<void> {
  draft.setResource(choice)
  bridge.haptic.selection()
  await flow.next('resource')
}
</script>

<template>
  <StepLayout step="resource" title="miniapp.steps.resource">
    <Stack :gap="3" role="radiogroup" :aria-label="t('miniapp.steps.resource')">
      <SelectableCard
        :model-value="draft.resource ?? undefined"
        value="any"
        :title="t('miniapp.resource.any')"
        :subtitle="t('miniapp.resource.anyHint')"
        name="resource"
        @update:model-value="pick"
      />
      <SelectableCard
        v-for="resource in flow.eligibleResources()"
        :key="resource.id"
        :model-value="draft.resource ?? undefined"
        :value="resource.id"
        :title="resource.name"
        :subtitle="resource.title ?? undefined"
        name="resource"
        @update:model-value="pick"
      />
    </Stack>
  </StepLayout>
</template>
