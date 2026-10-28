<script setup lang="ts">
import { Button, EmptyState, ErrorState, Skeleton, Stack } from '@app/ui'
import { computed, defineAsyncComponent, ref } from 'vue'

import { buildMaxBotLink } from '../../../max.config'
import { useMaxBridge } from '../../bridge/useMaxBridge'
import { errorCode, isSessionError, provideBootstrap, useBootstrapQuery } from './useBootstrap'
import type { Bootstrap } from './useBootstrap'

// Демо-мост подключается только в демо-сборке: иначе его кода нет в бандле (раздел 10.9 ТЗ).
const DemoGate =
  import.meta.env.VITE_DEMO === 'true' ? defineAsyncComponent(() => import('./DemoGate.vue')) : null

// Мост подменяется после ввода имени в демо-режиме, поэтому счётчик пересчитывает состояние.
const bridgeVersion = ref(0)
const bridge = computed(() => {
  void bridgeVersion.value
  return useMaxBridge()
})

const query = useBootstrapQuery(computed(() => bridge.value.available))
const data = computed<Bootstrap | undefined>(() => query.data.value)
const bootstrap = computed(() => data.value as Bootstrap)
provideBootstrap(bootstrap)

const sessionExpired = computed(() => isSessionError(query.error.value))
const openBot = (): void => bridge.value.openLink(buildMaxBotLink())
</script>

<template>
  <DemoGate v-if="!bridge.available && DemoGate" @ready="bridgeVersion += 1" />
  <EmptyState
    v-else-if="!bridge.available"
    icon="phone"
    title="miniapp.launch.openInMaxTitle"
    description="miniapp.launch.openInMaxText"
  >
    <Button label="miniapp.launch.openBot" @click="openBot" />
  </EmptyState>
  <Stack v-else-if="query.isPending.value" :gap="4" class="launch-skeleton">
    <Skeleton height="2rem" width="60%" />
    <Skeleton height="4.5rem" :lines="3" />
  </Stack>
  <EmptyState
    v-else-if="sessionExpired"
    icon="alert-circle"
    title="miniapp.launch.expiredTitle"
    description="miniapp.launch.expiredText"
  />
  <ErrorState
    v-else-if="query.isError.value"
    :code="errorCode(query.error.value)"
    @retry="query.refetch()"
  />
  <slot v-else />
</template>

<style scoped>
.launch-skeleton {
  padding: var(--space-4);
}
</style>
