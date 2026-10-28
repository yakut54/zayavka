<script setup lang="ts">
import { Drawer, Skeleton, Tabs } from '@app/ui'
import type { TabItem } from '@app/ui'
import { computed, ref, watch } from 'vue'

import { useResourcesQuery } from '../bookings/queries'
import ExceptionsTab from './ExceptionsTab.vue'
import ProfileTab from './ProfileTab.vue'
import ScheduleTab from './ScheduleTab.vue'

const props = defineProps<{ id: string | undefined }>()
const emit = defineEmits<{ close: [] }>()

const resources = useResourcesQuery()
const resource = computed(() => resources.data.value?.find((r) => r.id === props.id))

const tab = ref('profile')
const tabs: TabItem[] = [
  { id: 'profile', label: 'admin.resources.tabs.profile' },
  { id: 'schedule', label: 'admin.resources.tabs.schedule' },
  { id: 'exceptions', label: 'admin.resources.tabs.exceptions' },
]
watch(
  () => props.id,
  () => (tab.value = 'profile'),
)
</script>

<template>
  <Drawer
    :open="Boolean(id)"
    :title="resource ? 'admin.resources.card' : 'admin.nav.resources'"
    :title-args="{ name: resource?.name ?? '' }"
    @update:open="(value) => !value && emit('close')"
  >
    <Skeleton v-if="resources.isPending.value" :lines="5" />
    <template v-else-if="resource">
      <Tabs v-model="tab" :items="tabs" label="admin.resources.tabsLabel" />
      <div class="panel">
        <ProfileTab v-if="tab === 'profile'" :resource="resource" @deleted="emit('close')" />
        <ScheduleTab v-else-if="tab === 'schedule'" :resource-id="resource.id" />
        <ExceptionsTab v-else :resource-id="resource.id" />
      </div>
    </template>
  </Drawer>
</template>

<style scoped>
.panel {
  margin-block-start: var(--space-5);
}
</style>
