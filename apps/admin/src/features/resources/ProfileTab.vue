<script setup lang="ts">
import { ApiError } from '@app/api-client'
import { T } from '@app/i18n'
import { Button, Checkbox, Dialog, Field, Inline, Input, Stack, Text, useToast } from '@app/ui'
import { computed, ref, watch } from 'vue'

import { adminConfig } from '../../../admin.config'
import { type Resource, useDeleteResource, usePatchResource, useSetServices } from './queries'

const props = defineProps<{ resource: Resource }>()
const emit = defineEmits<{ deleted: [] }>()

const toast = useToast()
const patch = usePatchResource()
const setServices = useSetServices()
const remove = useDeleteResource()

const name = ref(props.resource.name)
const title = ref(props.resource.title ?? '')
const active = ref(props.resource.is_active)
const slugs = ref<string[]>([...props.resource.service_slugs])
const attempted = ref(false)

watch(
  () => props.resource,
  (next) => {
    name.value = next.name
    title.value = next.title ?? ''
    active.value = next.is_active
    slugs.value = [...next.service_slugs]
  },
)

const services = Object.entries(adminConfig.services)
const nameError = computed(() =>
  attempted.value && name.value.trim() === '' ? ('errors.field.required' as const) : undefined,
)

function toggle(slug: string, on: boolean): void {
  slugs.value = on ? [...slugs.value, slug] : slugs.value.filter((s) => s !== slug)
}

async function save(): Promise<void> {
  attempted.value = true
  if (name.value.trim() === '') return
  try {
    await patch.mutateAsync({
      id: props.resource.id,
      body: { name: name.value, title: title.value, is_active: active.value },
    })
    await setServices.mutateAsync({ id: props.resource.id, slugs: slugs.value })
    toast.success('admin.resources.profile.saved')
  } catch {
    toast.error('errors.api.internal_error')
  }
}

// Удаление: при будущих записях предлагается скрыть сотрудника (раздел 11.5 ТЗ).
const hideOffer = ref(false)
const deleteOpen = ref(false)

async function confirmDelete(): Promise<void> {
  try {
    await remove.mutateAsync(props.resource.id)
    deleteOpen.value = false
    toast.success('admin.resources.profile.deleted')
    emit('deleted')
  } catch (error) {
    deleteOpen.value = false
    if (error instanceof ApiError && error.status === 409 && error.code === 'has_future_bookings') {
      hideOffer.value = true
    } else toast.error('errors.api.internal_error')
  }
}

async function confirmHide(): Promise<void> {
  try {
    await patch.mutateAsync({ id: props.resource.id, body: { is_active: false } })
    hideOffer.value = false
    toast.success('admin.resources.profile.hidden')
  } catch {
    hideOffer.value = false
    toast.error('errors.api.internal_error')
  }
}
</script>

<template>
  <form novalidate @submit.prevent="save">
    <Stack :gap="4">
      <Field
        v-slot="{ id, describedBy, invalid }"
        label="admin.resources.name"
        :error="nameError"
        required
      >
        <Input
          :id="id"
          v-model="name"
          name="name"
          autocomplete="off"
          :maxlength="80"
          :aria-describedby="describedBy"
          :invalid="invalid"
        />
      </Field>
      <Field v-slot="{ id }" label="admin.resources.titleField" optional-mark>
        <Input :id="id" v-model="title" name="title" autocomplete="off" :maxlength="80" />
      </Field>
      <Checkbox v-model="active" name="active">
        <Text k="admin.resources.active" as="span" />
      </Checkbox>
      <fieldset class="services">
        <legend><Text k="admin.resources.services" variant="label" as="span" /></legend>
        <Stack :gap="2">
          <Checkbox
            v-for="[slug, key] in services"
            :key="slug"
            :model-value="slugs.includes(slug)"
            :name="`service-${slug}`"
            @update:model-value="(on) => toggle(slug, on)"
          >
            {{ T(key) }}
          </Checkbox>
        </Stack>
      </fieldset>
      <Inline :gap="3" wrap>
        <Button
          type="submit"
          label="admin.resources.profile.save"
          :loading="patch.isPending.value || setServices.isPending.value"
        />
        <Button
          label="admin.resources.profile.delete"
          variant="danger"
          @click="deleteOpen = true"
        />
      </Inline>
    </Stack>
  </form>

  <Dialog
    v-model:open="deleteOpen"
    title="admin.resources.profile.deleteTitle"
    description="admin.resources.profile.deleteText"
    confirm-label="admin.resources.profile.deleteConfirm"
    tone="danger"
    :loading="remove.isPending.value"
    @confirm="confirmDelete"
  />
  <Dialog
    v-model:open="hideOffer"
    title="admin.resources.profile.hideTitle"
    description="admin.resources.profile.hideText"
    confirm-label="admin.resources.profile.hideConfirm"
    :loading="patch.isPending.value"
    @confirm="confirmHide"
  />
</template>

<style scoped>
.services {
  margin: 0;
  padding: 0;
  border: 0;
}

.services legend {
  margin-block-end: var(--space-2);
  padding: 0;
}
</style>
