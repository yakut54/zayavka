<script setup lang="ts">
import { ApiError } from '@app/api-client'
import { T } from '@app/i18n'
import {
  Alert,
  Badge,
  Button,
  Dialog,
  Drawer,
  ErrorState,
  Field,
  Heading,
  IconButton,
  Inline,
  Select,
  Skeleton,
  Stack,
  Text,
  Textarea,
  useToast,
} from '@app/ui'
import type { SelectOption } from '@app/ui'
import { computed, ref } from 'vue'

import { adminConfig } from '../../../admin.config'
import { displayPhone, formatDateTime } from '../../format'
import { useCopyPhone } from './clipboard'
import { useAddNote, useChangeStatus, useLeadQuery } from './queries'
import { STATUSES, STATUS_TONE, type LeadStatus, isLeadStatus, statusLabel } from './statuses'

const props = defineProps<{ id: string | undefined }>()
const emit = defineEmits<{ close: [] }>()

const toast = useToast()
const leadQuery = useLeadQuery(() => props.id)
const changeStatus = useChangeStatus()
const addNote = useAddNote()
const copyPhone = useCopyPhone()

const open = computed(() => Boolean(props.id))
const detail = computed(() => leadQuery.data.value)
const number = computed(() => detail.value?.lead.public_number ?? 0)
const errorCode = computed(() =>
  leadQuery.error.value instanceof ApiError ? leadQuery.error.value.code : 'internal_error',
)
const events = computed(() => [...(detail.value?.events ?? [])].reverse())

const statusOptions: SelectOption[] = STATUSES.map((s) => ({ value: s, label: statusLabel(s) }))
const spamPending = ref<LeadStatus | null>(null)
const noteText = ref('')

async function applyStatus(status: LeadStatus): Promise<void> {
  const current = detail.value?.lead
  if (!current || !props.id) return
  try {
    await changeStatus.mutateAsync({ id: props.id, status, version: current.version })
    toast.success('admin.lead.statusChanged')
  } catch (error) {
    if (error instanceof ApiError && error.status === 409) {
      toast.info('errors.api.version_conflict')
      await leadQuery.refetch()
    } else if (!(error instanceof ApiError && error.status === 401)) {
      toast.error('errors.api.internal_error')
    }
  }
}

function onStatusChange(value: string): void {
  if (!isLeadStatus(value) || value === detail.value?.lead.status) return
  if (value === 'spam') spamPending.value = value
  else void applyStatus(value)
}

async function confirmSpam(): Promise<void> {
  const status = spamPending.value
  spamPending.value = null
  if (status) await applyStatus(status)
}

async function submitNote(): Promise<void> {
  const text = noteText.value.trim()
  if (!text || !props.id || addNote.isPending.value) return
  try {
    await addNote.mutateAsync({ id: props.id, text })
    noteText.value = ''
    toast.success('admin.lead.noteAdded')
  } catch (error) {
    if (error instanceof ApiError && error.status === 422) toast.error('errors.field.too_long')
    else if (!(error instanceof ApiError && error.status === 401))
      toast.error('errors.api.internal_error')
  }
}

const serviceKey = computed(() => {
  const slug = detail.value?.lead.service_slug
  return slug ? (adminConfig.services[slug] ?? null) : null
})

function eventStatusArgs(payload: Record<string, unknown>) {
  const label = (value: unknown) => (isLeadStatus(value) ? T(statusLabel(value)) : String(value))
  return { from: label(payload.from), to: label(payload.to) }
}
</script>

<template>
  <Drawer
    :open="open"
    :title="detail ? 'admin.lead.title' : 'admin.leads.title'"
    :title-args="{ number }"
    @update:open="(value) => !value && emit('close')"
  >
    <Stack v-if="leadQuery.isPending.value" :gap="4"><Skeleton :lines="6" /></Stack>
    <ErrorState
      v-else-if="leadQuery.isError.value"
      :code="errorCode"
      @retry="leadQuery.refetch()"
    />

    <Stack v-else-if="detail" :gap="6">
      <Inline :gap="3" wrap>
        <Text
          k="admin.lead.created"
          :args="{ date: formatDateTime(detail.lead.created_at) }"
          tone="muted"
          as="span"
        />
        <Badge :k="statusLabel(detail.lead.status)" :tone="STATUS_TONE[detail.lead.status]" />
      </Inline>

      <Alert v-if="detail.lead.anonymized_at" tone="info" k="admin.lead.anonymized" />

      <section aria-labelledby="lead-contact-title">
        <Stack :gap="4">
          <Heading id="lead-contact-title" k="admin.lead.contact" :level="3" variant="h3" />
          <dl class="lead__facts">
            <div>
              <Text k="admin.lead.name" as="dt" variant="label" tone="muted" />
              <dd class="lead__value">{{ detail.lead.name }}</dd>
            </div>
            <div>
              <Text k="admin.lead.phone" as="dt" variant="label" tone="muted" />
              <dd class="lead__value">
                <Inline :gap="2" wrap>
                  <span>{{ displayPhone(detail.lead.phone_e164) }}</span>
                  <Button
                    label="admin.lead.call"
                    variant="secondary"
                    size="sm"
                    icon-start="phone"
                    :href="`tel:${detail.lead.phone_e164}`"
                  />
                  <IconButton
                    icon-only="copy"
                    ariaLabel="admin.leads.copyPhone"
                    size="sm"
                    @click="copyPhone(detail.lead.phone_e164)"
                  />
                </Inline>
              </dd>
            </div>
            <div v-if="detail.lead.email">
              <Text k="admin.lead.email" as="dt" variant="label" tone="muted" />
              <dd class="lead__value">
                <Inline :gap="2" wrap>
                  <span>{{ detail.lead.email }}</span>
                  <Button
                    label="admin.lead.write"
                    variant="secondary"
                    size="sm"
                    icon-start="mail"
                    :href="`mailto:${detail.lead.email}`"
                  />
                </Inline>
              </dd>
            </div>
            <div v-if="serviceKey || detail.lead.service_slug">
              <Text k="admin.lead.service" as="dt" variant="label" tone="muted" />
              <dd class="lead__value">
                <Text v-if="serviceKey" :k="serviceKey" as="span" />
                <span v-else>{{ detail.lead.service_slug }}</span>
              </dd>
            </div>
            <div v-if="detail.lead.message">
              <Text k="admin.lead.message" as="dt" variant="label" tone="muted" />
              <dd class="lead__value lead__message">{{ detail.lead.message }}</dd>
            </div>
          </dl>
        </Stack>
      </section>

      <Field v-slot="{ id: fieldId }" label="admin.lead.status">
        <Select
          :id="fieldId"
          :model-value="detail.lead.status"
          :options="statusOptions"
          :disabled="changeStatus.isPending.value"
          @update:model-value="onStatusChange"
        />
      </Field>

      <section aria-labelledby="lead-notes-title">
        <Stack :gap="3">
          <Heading id="lead-notes-title" k="admin.lead.notes" :level="3" variant="h3" />
          <Field
            v-slot="{ id: fieldId, describedBy }"
            label="admin.lead.noteLabel"
            hint="admin.lead.noteHint"
          >
            <Textarea
              :id="fieldId"
              v-model="noteText"
              :aria-describedby="describedBy"
              :rows="3"
              :maxlength="2000"
              autoresize
              @submit="submitNote"
            />
          </Field>
          <div>
            <Button
              label="admin.lead.noteAdd"
              variant="secondary"
              :disabled="noteText.trim() === ''"
              :loading="addNote.isPending.value"
              @click="submitNote"
            />
          </div>
        </Stack>
      </section>

      <section aria-labelledby="lead-history-title">
        <Stack :gap="3">
          <Heading id="lead-history-title" k="admin.lead.history" :level="3" variant="h3" />
          <ol class="lead__history">
            <li v-for="event in events" :key="event.id" class="lead__event">
              <Text
                v-if="event.type === 'created'"
                k="admin.lead.historyCreated"
                as="p"
                weight="medium"
              />
              <Text
                v-else-if="event.type === 'status_changed'"
                k="admin.lead.historyStatus"
                :args="eventStatusArgs(event.payload)"
                as="p"
                weight="medium"
              />
              <p v-else class="lead__note">{{ event.payload.text }}</p>
              <p class="lead__meta">
                <time :datetime="event.created_at">{{ formatDateTime(event.created_at) }}</time>
                <span v-if="event.actor"> · {{ event.actor.email }}</span>
                <Text
                  v-else
                  k="admin.lead.historySystem"
                  as="span"
                  variant="caption"
                  tone="muted"
                />
              </p>
            </li>
          </ol>
        </Stack>
      </section>
    </Stack>

    <Dialog
      :open="spamPending !== null"
      title="admin.lead.spamTitle"
      description="admin.lead.spamText"
      confirm-label="admin.lead.spamConfirm"
      tone="danger"
      @update:open="(value) => !value && (spamPending = null)"
      @confirm="confirmSpam"
    />
  </Drawer>
</template>

<style scoped>
.lead__facts {
  display: grid;
  gap: var(--space-4);
  margin: 0;
}

.lead__value {
  margin: var(--space-1) 0 0;
  overflow-wrap: anywhere;
}

.lead__message {
  white-space: pre-wrap;
}

.lead__history {
  display: grid;
  gap: var(--space-4);
  margin: 0;
  padding: 0;
  list-style: none;
}

.lead__event {
  padding-inline-start: var(--space-3);
  border-inline-start: 3px solid var(--color-border-strong);
}

.lead__note {
  margin: 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.lead__meta {
  margin: var(--space-1) 0 0;
  color: var(--color-text-muted);
  font-size: var(--text-sm);
}
</style>
