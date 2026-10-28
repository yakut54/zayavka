<script setup lang="ts">
import { T } from '@app/i18n'
import {
  Button,
  EmptyState,
  ErrorState,
  Field,
  Heading,
  IconButton,
  Input,
  Select,
  Skeleton,
  Stack,
  Surface,
  Text,
  TimeRangeInput,
  useToast,
} from '@app/ui'
import type { SelectOption, TimeRange } from '@app/ui'
import { computed, ref } from 'vue'

import { adminConfig } from '../../../admin.config'
import { addDays, formatDay, hm, todayIn } from '../../lib/zoned'
import ConflictDialog from './ConflictDialog.vue'
import {
  type ConflictBooking,
  type ExceptionCreate,
  type ForceOptions,
  type ScheduleException,
  conflictsOf,
  useDeleteException,
  useExceptionsQuery,
  useSaveException,
} from './queries'

const props = defineProps<{ resourceId: string }>()

const HORIZON_DAYS = 60
const toast = useToast()
const today = todayIn(adminConfig.timezone)
const range = computed(() => ({ from: today, to: addDays(today, HORIZON_DAYS) }))
const list = useExceptionsQuery(
  () => props.resourceId,
  () => range.value,
)
const save = useSaveException()
const remove = useDeleteException()

const kindOptions: SelectOption[] = [
  { value: 'day_off', label: 'admin.resources.exceptions.dayOff' },
  { value: 'custom_hours', label: 'admin.resources.exceptions.customHours' },
]

const date = ref(today)
const kind = ref<'day_off' | 'custom_hours'>('day_off')
const intervals = ref<TimeRange[]>([[600, 900]])
const note = ref('')
const dateError = computed(() =>
  date.value === '' ? ('errors.field.required' as const) : undefined,
)
const intervalsInvalid = computed(
  () =>
    kind.value === 'custom_hours' &&
    (intervals.value.length === 0 ||
      intervals.value.some(([a, b]) => b <= a) ||
      [...intervals.value]
        .sort((x, y) => x[0] - y[0])
        .some((item, i, all) => i > 0 && item[0] < (all[i - 1] as TimeRange)[1])),
)

const conflicts = ref<ConflictBooking[] | null>(null)
let retry: ((options: ForceOptions) => Promise<void>) | null = null

function body(): ExceptionCreate {
  return {
    date: date.value,
    kind: kind.value,
    intervals:
      kind.value === 'custom_hours'
        ? intervals.value.map(([start, end]) => ({ start_min: start, end_min: end }))
        : [],
    note: note.value.trim() || null,
  }
}

async function add(options?: ForceOptions): Promise<void> {
  try {
    await save.mutateAsync({ id: props.resourceId, body: body(), ...(options ? { options } : {}) })
    conflicts.value = null
    note.value = ''
    toast.success('admin.resources.exceptions.saved')
  } catch (error) {
    const found = conflictsOf(error)
    if (found) {
      conflicts.value = found
      retry = (next) => add(next)
    } else toast.error('errors.api.internal_error')
  }
}

async function drop(item: ScheduleException, options?: ForceOptions): Promise<void> {
  try {
    await remove.mutateAsync({
      id: props.resourceId,
      exceptionId: item.id,
      ...(options ? { options } : {}),
    })
    conflicts.value = null
    toast.success('admin.resources.exceptions.removed')
  } catch (error) {
    const found = conflictsOf(error)
    if (found) {
      conflicts.value = found
      retry = (next) => drop(item, next)
    } else toast.error('errors.api.internal_error')
  }
}

const dialogOpen = computed({
  get: () => conflicts.value !== null,
  set: (open) => {
    if (!open) conflicts.value = null
  },
})

const describe = (item: ScheduleException): string =>
  item.kind === 'day_off'
    ? T('admin.resources.exceptions.dayOff')
    : item.intervals.map((i) => `${hm(i.start_min ?? 0)}–${hm(i.end_min ?? 0)}`).join(', ')

function addInterval(): void {
  const last = Math.max(0, ...intervals.value.map(([, end]) => end))
  if (last < 1440 - 5) intervals.value = [...intervals.value, [last, Math.min(last + 120, 1440)]]
}
</script>

<template>
  <Stack :gap="6">
    <Stack :gap="3">
      <Heading k="admin.resources.exceptions.upcoming" :level="3" variant="h3" />
      <Skeleton v-if="list.isPending.value" :lines="3" />
      <ErrorState v-else-if="list.isError.value" @retry="list.refetch()" />
      <EmptyState
        v-else-if="(list.data.value ?? []).length === 0"
        title="admin.resources.exceptions.empty"
        description="admin.resources.exceptions.emptyHint"
      />
      <ul v-else class="exceptions">
        <li v-for="item in list.data.value" :key="item.id" class="exceptions__item">
          <div>
            <p class="exceptions__date">{{ formatDay(item.date) }}</p>
            <p class="exceptions__what">{{ describe(item) }}</p>
            <p v-if="item.note" class="exceptions__note">{{ item.note }}</p>
          </div>
          <IconButton
            icon-only="x"
            ariaLabel="admin.resources.exceptions.remove"
            variant="ghost"
            :loading="remove.isPending.value"
            @click="drop(item)"
          />
        </li>
      </ul>
    </Stack>

    <Surface :padding="4">
      <form novalidate @submit.prevent="!dateError && !intervalsInvalid && add()">
        <Stack :gap="4">
          <Heading k="admin.resources.exceptions.add" :level="3" variant="h3" />
          <Field
            v-slot="{ id, describedBy, invalid }"
            label="admin.resources.exceptions.date"
            :error="dateError"
            required
          >
            <Input
              :id="id"
              v-model="date"
              type="date"
              autocomplete="off"
              :min="today"
              :aria-describedby="describedBy"
              :invalid="invalid"
            />
          </Field>
          <Field v-slot="{ id }" label="admin.resources.exceptions.kind">
            <Select
              :id="id"
              :model-value="kind"
              :options="kindOptions"
              @update:model-value="
                (v) => (kind = v === 'custom_hours' ? 'custom_hours' : 'day_off')
              "
            />
          </Field>
          <Stack v-if="kind === 'custom_hours'" :gap="2">
            <div v-for="(slot, index) in intervals" :key="index" class="exceptions__interval">
              <TimeRangeInput
                :model-value="slot"
                :invalid="intervalsInvalid"
                @update:model-value="
                  (v) => (intervals = intervals.map((x, i) => (i === index ? v : x)))
                "
              />
              <IconButton
                icon-only="x"
                ariaLabel="ui.schedule.removeInterval"
                variant="ghost"
                @click="intervals = intervals.filter((_, i) => i !== index)"
              />
            </div>
            <Button
              label="ui.schedule.addInterval"
              variant="ghost"
              size="sm"
              @click="addInterval"
            />
            <Text
              v-if="intervalsInvalid"
              k="admin.resources.exceptions.intervalsError"
              tone="danger"
              as="p"
            />
          </Stack>
          <Field v-slot="{ id }" label="admin.resources.exceptions.note" optional-mark>
            <Input :id="id" v-model="note" autocomplete="off" :maxlength="200" />
          </Field>
          <div>
            <Button
              type="submit"
              label="admin.resources.exceptions.addButton"
              :loading="save.isPending.value && !dialogOpen"
            />
          </div>
        </Stack>
      </form>
    </Surface>

    <ConflictDialog
      v-model:open="dialogOpen"
      :bookings="conflicts ?? []"
      :loading="save.isPending.value || remove.isPending.value"
      @cancel-all="retry?.({ force: true, cancelConflicting: true })"
      @keep="retry?.({ force: true })"
    />
  </Stack>
</template>

<style scoped>
.exceptions {
  display: grid;
  gap: var(--space-3);
  margin: 0;
  padding: 0;
  list-style: none;
}

.exceptions__item,
.exceptions__interval {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
}

.exceptions__date {
  margin: 0;
  font-weight: 600;
}

.exceptions__what,
.exceptions__note {
  margin: 0;
  color: var(--color-text-muted);
}
</style>
