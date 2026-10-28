<script setup lang="ts">
import { Button, ErrorState, Inline, Skeleton, Stack, WeekScheduleEditor, useToast } from '@app/ui'
import type { WeekSchedule } from '@app/ui'
import { computed, ref, watch } from 'vue'

import ConflictDialog from './ConflictDialog.vue'
import {
  type ConflictBooking,
  type ForceOptions,
  conflictsOf,
  useSaveWorkingHours,
  useWorkingHoursQuery,
} from './queries'

const props = defineProps<{ resourceId: string }>()

const toast = useToast()
const hours = useWorkingHoursQuery(() => props.resourceId)
const save = useSaveWorkingHours()

const baseline = ref<WeekSchedule>({})
const draft = ref<WeekSchedule>({})
const valid = ref(true)
const editorKey = ref(0)
const conflicts = ref<ConflictBooking[] | null>(null)

const clone = (value: WeekSchedule): WeekSchedule =>
  Object.fromEntries(
    Object.entries(value).map(([day, list]) => [day, list.map(([a, b]) => [a, b])]),
  )

// Сохранённый график — основа для «Сбросить изменения»; редактор пересоздаётся при смене основы.
watch(
  () => hours.data.value,
  (data) => {
    if (!data) return
    baseline.value = clone(data.days as WeekSchedule)
    draft.value = clone(data.days as WeekSchedule)
    editorKey.value += 1
  },
  { immediate: true },
)

const changed = computed(() => JSON.stringify(draft.value) !== JSON.stringify(baseline.value))

async function persist(options?: ForceOptions): Promise<void> {
  try {
    await save.mutateAsync({
      id: props.resourceId,
      days: draft.value as Record<number, [number, number][]>,
      ...(options ? { options } : {}),
    })
    conflicts.value = null
    toast.success('admin.resources.schedule.saved')
  } catch (error) {
    const found = conflictsOf(error)
    if (found) conflicts.value = found
    else toast.error('errors.api.internal_error')
  }
}

const dialogOpen = computed({
  get: () => conflicts.value !== null,
  set: (open) => {
    if (!open) conflicts.value = null
  },
})
</script>

<template>
  <Skeleton v-if="hours.isPending.value" :lines="7" />
  <ErrorState v-else-if="hours.isError.value" @retry="hours.refetch()" />
  <Stack v-else :gap="5">
    <WeekScheduleEditor
      :key="editorKey"
      v-model="draft"
      :baseline="baseline"
      @update:valid="(ok) => (valid = ok)"
    />
    <Inline :gap="3">
      <Button
        label="admin.resources.schedule.save"
        :disabled="!valid || !changed"
        :loading="save.isPending.value && !dialogOpen"
        @click="persist()"
      />
    </Inline>
    <ConflictDialog
      v-model:open="dialogOpen"
      :bookings="conflicts ?? []"
      :loading="save.isPending.value"
      @cancel-all="persist({ force: true, cancelConflicting: true })"
      @keep="persist({ force: true })"
    />
  </Stack>
</template>
