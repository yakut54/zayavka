<script setup lang="ts">
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  Heading,
  IconButton,
  Inline,
  Skeleton,
  Stack,
  Surface,
  Text,
  useToast,
} from '@app/ui'
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { adminConfig } from '../../admin.config'
import { useResourcesQuery } from '../features/bookings/queries'
import ResourceCreateDrawer from '../features/resources/ResourceCreateDrawer.vue'
import ResourceDrawer from '../features/resources/ResourceDrawer.vue'
import { type Resource, usePatchResource } from '../features/resources/queries'

const route = useRoute()
const router = useRouter()
const toast = useToast()
const resources = useResourcesQuery()
const patch = usePatchResource()

const sorted = computed<Resource[]>(() =>
  [...(resources.data.value ?? [])].sort(
    (a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, 'ru'),
  ),
)
const nextOrder = computed(() => Math.max(-1, ...sorted.value.map((r) => r.sort_order)) + 1)
const openId = computed(() => (typeof route.params.id === 'string' ? route.params.id : undefined))
const createOpen = ref(false)

const open = (id: string): Promise<unknown> => router.push({ name: 'resources', params: { id } })
const close = (): Promise<unknown> => router.push({ name: 'resources', params: {} })

/** Порядок — по месту в списке: после перестановки значения переписываются 0…n−1. */
async function move(index: number, delta: -1 | 1): Promise<void> {
  const list = [...sorted.value]
  const target = index + delta
  if (target < 0 || target >= list.length) return
  const [item] = list.splice(index, 1)
  list.splice(target, 0, item as Resource)
  try {
    await Promise.all(
      list.flatMap((resource, order) =>
        resource.sort_order === order
          ? []
          : [patch.mutateAsync({ id: resource.id, body: { sort_order: order } })],
      ),
    )
  } catch {
    toast.error('errors.api.internal_error')
  }
}

const serviceName = (slug: string) => adminConfig.services[slug]
</script>

<template>
  <Stack :gap="5">
    <Inline :gap="3" justify="between" wrap>
      <Heading k="admin.nav.resources" :level="1" />
      <Button label="admin.resources.add" @click="createOpen = true" />
    </Inline>

    <ErrorState v-if="resources.isError.value" @retry="resources.refetch()" />
    <Skeleton v-else-if="resources.isPending.value" :lines="4" />
    <EmptyState
      v-else-if="sorted.length === 0"
      title="admin.resources.empty"
      description="admin.resources.emptyHint"
    >
      <Button label="admin.resources.add" @click="createOpen = true" />
    </EmptyState>
    <ul v-else class="list">
      <li v-for="(resource, index) in sorted" :key="resource.id">
        <Surface :padding="4" as="div" class="item">
          <div class="item__main">
            <button type="button" class="item__open" @click="open(resource.id)">
              <span class="item__name">{{ resource.name }}</span>
              <span v-if="resource.title" class="item__title">{{ resource.title }}</span>
            </button>
            <Inline :gap="2" wrap>
              <Badge
                v-for="slug in resource.service_slugs"
                :key="slug"
                :k="serviceName(slug) ?? 'admin.resources.serviceUnknown'"
                tone="muted"
              />
              <Text
                v-if="resource.service_slugs.length === 0"
                k="admin.resources.noServices"
                tone="muted"
                as="span"
              />
            </Inline>
          </div>
          <Inline :gap="2">
            <Badge
              :k="
                resource.is_active ? 'admin.resources.statusActive' : 'admin.resources.statusHidden'
              "
              :tone="resource.is_active ? 'success' : 'muted'"
            />
            <IconButton
              icon-only="chevron-up"
              ariaLabel="admin.resources.moveUp"
              variant="ghost"
              :disabled="index === 0 || patch.isPending.value"
              @click="move(index, -1)"
            />
            <IconButton
              icon-only="chevron-down"
              ariaLabel="admin.resources.moveDown"
              variant="ghost"
              :disabled="index === sorted.length - 1 || patch.isPending.value"
              @click="move(index, 1)"
            />
          </Inline>
        </Surface>
      </li>
    </ul>

    <ResourceDrawer :id="openId" @close="close" />
    <ResourceCreateDrawer
      :open="createOpen"
      :next-order="nextOrder"
      @close="createOpen = false"
      @created="
        (id) => {
          createOpen = false
          open(id)
        }
      "
    />
  </Stack>
</template>

<style scoped>
.list {
  display: grid;
  gap: var(--space-3);
  margin: 0;
  padding: 0;
  list-style: none;
}

.item {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
}

.item__main {
  display: grid;
  gap: var(--space-2);
  min-width: 0;
}

.item__open {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  padding: 0;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  text-align: start;
  cursor: pointer;
}

.item__name {
  font-weight: 600;
  text-decoration: underline;
  text-underline-offset: 0.2em;
}

.item__title {
  color: var(--color-text-muted);
}
</style>
