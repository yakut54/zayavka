<script setup lang="ts">
import { Badge, Button, Drawer, Icon, IconButton, Inline, Text } from '@app/ui'
import { useQueryClient } from '@tanstack/vue-query'
import { computed, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'

import { adminConfig } from '../../admin.config'
import { useLogout, useMe } from '../features/auth/useAuth'
import { useNewLeadsCount } from '../features/leads/queries'
import { useUiStore } from '../stores/ui'

const router = useRouter()
const uiStore = useUiStore()
const queryClient = useQueryClient()
const me = useMe()
const newCount = useNewLeadsCount()
const logout = useLogout()
const menuOpen = ref(false)

const isDark = computed(() => uiStore.theme === 'dark')

async function onLogout(): Promise<void> {
  await logout.mutateAsync().catch(() => undefined)
  queryClient.clear()
  await router.replace({ name: 'login' })
}
</script>

<template>
  <div class="shell">
    <a class="shell__skip" href="#main"><Text k="admin.nav.skipToContent" as="span" /></a>

    <header class="shell__header">
      <Inline :gap="3" class="shell__brand">
        <IconButton
          icon-only="menu"
          ariaLabel="admin.nav.menu"
          class="shell__burger"
          aria-controls="shell-menu"
          :aria-expanded="menuOpen ? 'true' : 'false'"
          @click="menuOpen = true"
        />
        <Icon name="list" />
        <Text :k="adminConfig.brandName" variant="h3" as="span" />
      </Inline>
      <Inline :gap="3" class="shell__tools">
        <IconButton
          :icon-only="isDark ? 'sun' : 'moon'"
          :ariaLabel="isDark ? 'admin.shell.themeToLight' : 'admin.shell.themeToDark'"
          :aria-pressed="isDark ? 'true' : 'false'"
          @click="uiStore.toggle"
        />
        <span v-if="me.data.value" class="shell__email">{{ me.data.value.email }}</span>
        <Button
          label="admin.shell.logout"
          variant="ghost"
          size="sm"
          icon-start="logout"
          :loading="logout.isPending.value"
          @click="onLogout"
        />
      </Inline>
    </header>

    <div class="shell__body">
      <nav class="shell__nav" :aria-label="$t('admin.nav.mainNav')">
        <ul class="shell__list">
          <li>
            <RouterLink :to="{ name: 'leads' }" class="shell__link">
              <Icon name="inbox" />
              <Text k="admin.nav.leads" as="span" weight="medium" />
              <Badge
                v-if="(newCount.data.value ?? 0) > 0"
                k="admin.shell.newLeads"
                :args="{ count: newCount.data.value }"
                tone="accent"
              />
            </RouterLink>
          </li>
          <li>
            <RouterLink :to="{ name: 'account' }" class="shell__link">
              <Icon name="user" />
              <Text k="admin.nav.account" as="span" weight="medium" />
            </RouterLink>
          </li>
        </ul>
      </nav>
      <main id="main" tabindex="-1" class="shell__main"><slot /></main>
    </div>

    <Drawer v-model:open="menuOpen" side="start" title="admin.nav.menu">
      <nav id="shell-menu" :aria-label="$t('admin.nav.mainNav')">
        <ul class="shell__list">
          <li>
            <RouterLink :to="{ name: 'leads' }" class="shell__link" @click="menuOpen = false">
              <Icon name="inbox" />
              <Text k="admin.nav.leads" as="span" weight="medium" />
            </RouterLink>
          </li>
          <li>
            <RouterLink :to="{ name: 'account' }" class="shell__link" @click="menuOpen = false">
              <Icon name="user" />
              <Text k="admin.nav.account" as="span" weight="medium" />
            </RouterLink>
          </li>
        </ul>
      </nav>
    </Drawer>
  </div>
</template>

<style scoped>
.shell {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.shell__skip {
  position: absolute;
  inset-block-start: var(--space-2);
  inset-inline-start: var(--space-2);
  z-index: var(--z-toast);
  transform: translateY(-200%);
  padding: var(--space-2) var(--space-4);
  border-radius: var(--radius-md);
  background: var(--color-accent);
  text-decoration: none;
}

.shell__skip:focus {
  transform: none;
}

.shell__skip :deep(.ui-text) {
  color: var(--color-text-inverse);
}

.shell__header {
  position: sticky;
  inset-block-start: 0;
  z-index: var(--z-header);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  padding: var(--space-2) var(--space-4);
  background: var(--color-surface);
  border-block-end: 1px solid var(--color-border-strong);
}

.shell__email {
  display: none;
  color: var(--color-text-muted);
  font-size: var(--text-sm);
}

.shell__body {
  flex: 1;
  display: flex;
  min-width: 0;
}

.shell__nav {
  display: none;
  width: 14rem;
  flex: none;
  padding: var(--space-4);
  background: var(--color-surface);
  border-inline-end: 1px solid var(--color-border-strong);
}

.shell__list {
  display: grid;
  gap: var(--space-1);
  margin: 0;
  padding: 0;
  list-style: none;
}

.shell__link {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-height: var(--control-height-md);
  padding: 0 var(--space-3);
  border-radius: var(--radius-md);
  color: var(--color-text);
  text-decoration: none;
}

.shell__link:hover {
  background: var(--color-surface-muted);
}

.shell__link.router-link-active {
  background: var(--color-accent-subtle);
  color: var(--color-accent);
}

.shell__link :deep(.ui-text) {
  color: inherit;
}

.shell__main {
  flex: 1;
  min-width: 0;
  padding: var(--space-4);
}

.shell__main:focus {
  outline: none;
}

@media (min-width: 768px) {
  .shell__nav {
    display: block;
  }

  .shell__burger {
    display: none;
  }

  .shell__email {
    display: inline;
  }

  .shell__main {
    padding: var(--space-6);
  }
}
</style>
