<script setup lang="ts">
import type { MessageKey } from '@app/i18n'
import { messages } from '@app/i18n'
import { computed } from 'vue'

import Button from '../Button/Button.vue'
import Icon from '../Icon/Icon.vue'
import Text from '../Text/Text.vue'

const props = withDefaults(defineProps<{ code?: string }>(), { code: 'internal_error' })

defineEmits<{ retry: [] }>()

const known = Object.keys(messages.errors.api)
const description = computed<MessageKey>(() =>
  known.includes(props.code)
    ? (`errors.api.${props.code}` as MessageKey)
    : 'errors.api.internal_error',
)
</script>

<template>
  <div class="ui-error-state" role="alert">
    <Icon name="alert-circle" size="lg" class="ui-error-state__icon" />
    <Text k="ui.errorState.title" variant="h3" as="p" align="center" />
    <Text :k="description" tone="muted" as="p" align="center" />
    <Button label="common.retry" variant="secondary" @click="$emit('retry')" />
  </div>
</template>

<style scoped>
.ui-error-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-12) var(--space-4);
}

.ui-error-state__icon {
  color: var(--color-danger);
}
</style>
