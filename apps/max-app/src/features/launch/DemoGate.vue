<script setup lang="ts">
import type { MessageKey } from '@app/i18n'
import { Alert, Button, Field, Heading, Input, Stack, Text } from '@app/ui'
import { ref } from 'vue'

import { api } from '../../api'
import { createDemoBridge } from '../../bridge/demoBridge'
import { setMaxBridge } from '../../bridge/useMaxBridge'
import { errorCode, errorMessage } from './useBootstrap'

const emit = defineEmits<{ ready: [] }>()

const name = ref('')
const loading = ref(false)
const failed = ref<MessageKey | null>(null)

async function proceed(): Promise<void> {
  const firstName = name.value.trim()
  if (!firstName || loading.value) return
  loading.value = true
  failed.value = null
  try {
    const { data } = await api.POST('/api/v1/max/app/demo-session', {
      body: { first_name: firstName },
    })
    setMaxBridge(createDemoBridge(data?.init_data ?? '', firstName))
    emit('ready')
  } catch (error) {
    failed.value = errorMessage(errorCode(error))
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <form class="demo-gate" @submit.prevent="proceed">
    <Stack :gap="4">
      <Heading k="miniapp.demo.title" :level="1" />
      <Text k="miniapp.demo.text" tone="muted" as="p" />
      <Alert v-if="failed" tone="danger" :k="failed" />
      <Field v-slot="{ id, describedBy, invalid }" label="miniapp.demo.name" required>
        <Input
          :id="id"
          v-model="name"
          :aria-describedby="describedBy"
          :invalid="invalid"
          autocomplete="given-name"
          :maxlength="64"
        />
      </Field>
      <Button type="submit" label="miniapp.demo.continue" :loading="loading" />
    </Stack>
  </form>
</template>

<style scoped>
.demo-gate {
  padding: var(--space-6) var(--space-4);
}
</style>
