<script setup lang="ts">
import type { MessageKey } from '@app/i18n'

import Icon from '../Icon/Icon.vue'
import type { IconName } from '../Icon/icons'
import Text from '../Text/Text.vue'

withDefaults(defineProps<{ icon?: IconName; title: MessageKey; description?: MessageKey }>(), {
  icon: 'inbox',
})
</script>

<template>
  <div class="ui-empty">
    <Icon :name="icon" size="lg" class="ui-empty__icon" />
    <Text :k="title" variant="h3" as="p" align="center" />
    <Text v-if="description" :k="description" tone="muted" as="p" align="center" />
    <div v-if="$slots.default" class="ui-empty__action"><slot /></div>
  </div>
</template>

<style scoped>
.ui-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-12) var(--space-4);
  text-align: center;
}

.ui-empty__icon {
  color: var(--color-text-muted);
}

.ui-empty__action {
  margin-block-start: var(--space-2);
}
</style>
