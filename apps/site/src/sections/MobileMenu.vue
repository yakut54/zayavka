<script setup lang="ts">
import type { MessageKey } from '@app/i18n'
import { Button, Drawer, Link, Stack, Text } from '@app/ui'
import { RouterLink } from 'vue-router'

defineProps<{
  open: boolean
  nav: { id: string; label: MessageKey }[]
  phoneHref: string
  phoneText: string
  active: string | null
}>()

const emit = defineEmits<{ 'update:open': [value: boolean]; cta: [] }>()

function close(): void {
  emit('update:open', false)
}

function onCta(): void {
  close()
  emit('cta')
}
</script>

<template>
  <Drawer :open="open" title="nav.menu" side="end" @update:open="emit('update:open', $event)">
    <Stack id="mobile-menu" :gap="6">
      <nav :aria-label="$t('nav.mainNav')">
        <ul class="mobile-menu__list">
          <li v-for="item in nav" :key="item.id">
            <RouterLink
              :to="{ path: '/', hash: `#${item.id}` }"
              class="mobile-menu__link"
              :aria-current="active === item.id ? 'true' : undefined"
              @click="close"
            >
              <Text :k="item.label" variant="body-lg" weight="medium" as="span" />
            </RouterLink>
          </li>
        </ul>
      </nav>
      <Link :href="phoneHref" :text="phoneText" />
      <Button label="nav.cta" block @click="onCta" />
    </Stack>
  </Drawer>
</template>

<style scoped>
.mobile-menu__list {
  display: grid;
  gap: var(--space-1);
  margin: 0;
  padding: 0;
  list-style: none;
}

.mobile-menu__link {
  display: flex;
  align-items: center;
  min-height: var(--control-height-md);
  padding: 0 var(--space-3);
  border-radius: var(--radius-md);
  color: var(--color-text);
  text-decoration: none;
}

.mobile-menu__link[aria-current='true'] {
  background: var(--color-accent-subtle);
  color: var(--color-accent);
}

.mobile-menu__link :deep(.ui-text) {
  color: inherit;
}
</style>
