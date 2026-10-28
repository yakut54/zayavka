<script setup lang="ts">
import type { MessageKey } from '@app/i18n'
import { BottomBar, Container, IconButton, Stack, StepHeader } from '@app/ui'
import { nextTick, onMounted, ref } from 'vue'

import { useMaxBridge } from '../../bridge/useMaxBridge'
import { type Step, useFlow } from './useFlow'
import { useBackButton } from './useBackButton'

const props = defineProps<{ step: Step; title: MessageKey }>()

const bridge = useMaxBridge()
const flow = useFlow()
const header = ref<HTMLElement | null>(null)

useBackButton(() => void flow.back(props.step))

// Фокус на заголовок шага: скринридер объявляет, где пользователь оказался.
onMounted(async () => {
  await nextTick()
  const heading = header.value?.querySelector<HTMLElement>('h1, h2')
  heading?.setAttribute('tabindex', '-1')
  heading?.focus()
})
</script>

<template>
  <Container>
    <Stack :gap="4" class="step">
      <div ref="header" class="step__header">
        <IconButton
          v-if="bridge.demo"
          icon-only="chevron-left"
          ariaLabel="miniapp.back"
          variant="ghost"
          @click="flow.back(step)"
        />
        <StepHeader :step="flow.info(step).step" :total="flow.info(step).total" :title="title" />
      </div>
      <slot />
    </Stack>
    <BottomBar v-if="$slots.footer"
      ><template #primary><slot name="footer" /></template
    ></BottomBar>
  </Container>
</template>

<style scoped>
.step {
  padding-block: var(--space-4);
}

.step__header {
  display: flex;
  align-items: flex-start;
  gap: var(--space-2);
}

.step__header :deep(.ui-step-header) {
  flex: 1;
}
</style>
