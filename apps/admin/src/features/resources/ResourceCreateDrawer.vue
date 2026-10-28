<script setup lang="ts">
import { T } from '@app/i18n'
import { Button, Checkbox, Drawer, Field, Input, Stack, Text, useForm, useToast } from '@app/ui'
import { computed, ref, watch } from 'vue'
import { z } from 'zod'

import { adminConfig } from '../../../admin.config'
import { useCreateResource, useSetServices } from './queries'

const props = defineProps<{ open: boolean; nextOrder: number }>()
const emit = defineEmits<{ close: []; created: [id: string] }>()

const toast = useToast()
const create = useCreateResource()
const setServices = useSetServices()

const services = Object.entries(adminConfig.services)
const selected = ref<string[]>([])

const schema = z.object({
  name: z.string().trim().min(1, 'required').max(80, 'too_long'),
  title: z.string().max(80, 'too_long'),
})

const form = useForm({
  schema,
  initial: { name: '', title: '' },
  onSubmit: async (values) => {
    const resource = await create.mutateAsync({
      name: values.name,
      title: values.title,
      sort_order: props.nextOrder,
    })
    if (selected.value.length > 0)
      await setServices.mutateAsync({ id: resource.id, slugs: selected.value })
    toast.success('admin.resources.created')
    emit('created', resource.id)
  },
  onError: () => toast.error('errors.api.internal_error'),
})

watch(
  () => props.open,
  (open) => {
    if (!open) return
    form.reset()
    selected.value = []
  },
)

const nameField = computed(() => form.field('name'))
const titleField = computed(() => form.field('title'))

function toggle(slug: string, on: boolean): void {
  selected.value = on ? [...selected.value, slug] : selected.value.filter((s) => s !== slug)
}
</script>

<template>
  <Drawer
    :open="open"
    title="admin.resources.add"
    @update:open="(value) => !value && emit('close')"
  >
    <form novalidate @submit.prevent="form.handleSubmit">
      <Stack :gap="4">
        <Field
          v-slot="{ id, describedBy, invalid }"
          label="admin.resources.name"
          :error="nameField.error"
          required
        >
          <Input
            :id="id"
            :model-value="nameField.modelValue"
            :name="nameField.name"
            autocomplete="off"
            :maxlength="80"
            :aria-describedby="describedBy"
            :invalid="invalid"
            @update:model-value="nameField['onUpdate:modelValue']"
            @blur="nameField.onBlur"
          />
        </Field>
        <Field
          v-slot="{ id }"
          label="admin.resources.titleField"
          :error="titleField.error"
          optional-mark
        >
          <Input
            :id="id"
            :model-value="titleField.modelValue"
            :name="titleField.name"
            autocomplete="off"
            :maxlength="80"
            @update:model-value="titleField['onUpdate:modelValue']"
          />
        </Field>
        <fieldset class="services">
          <legend><Text k="admin.resources.services" variant="label" as="span" /></legend>
          <Stack :gap="2">
            <Checkbox
              v-for="[slug, key] in services"
              :key="slug"
              :model-value="selected.includes(slug)"
              :name="`service-${slug}`"
              @update:model-value="(on) => toggle(slug, on)"
            >
              {{ T(key) }}
            </Checkbox>
          </Stack>
        </fieldset>
        <Button
          type="submit"
          label="admin.resources.createSubmit"
          :loading="form.isSubmitting.value"
          block
        />
      </Stack>
    </form>
  </Drawer>
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
