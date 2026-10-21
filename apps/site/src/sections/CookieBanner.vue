<script setup lang="ts">
import { Button, Inline, Text } from '@app/ui'
import { computed } from 'vue'

import { analyticsConsent, setConsent } from '../composables/useAnalytics'

const visible = computed(() => analyticsConsent.value === null)
</script>

<template>
  <aside v-if="visible" class="cookie" :aria-label="$t('site.cookie.text')">
    <Text k="site.cookie.text" as="p" variant="body-sm" />
    <Inline :gap="3">
      <Button
        label="site.cookie.accept"
        variant="secondary"
        size="sm"
        @click="setConsent('granted')"
      />
      <Button
        label="site.cookie.reject"
        variant="secondary"
        size="sm"
        @click="setConsent('denied')"
      />
    </Inline>
  </aside>
</template>

<style scoped>
.cookie {
  position: fixed;
  inset-inline: var(--space-4);
  inset-block-end: var(--space-4);
  z-index: var(--z-toast);
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  padding: var(--space-4);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-md);
  background: var(--color-surface-raised);
  box-shadow: var(--shadow-lg);
}
</style>
