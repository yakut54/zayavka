<script setup lang="ts">
import { Badge, Container, Divider, Heading, Link, Stack, Tabs, Text } from '@app/ui'
import type { TabItem } from '@app/ui'
import { ref } from 'vue'

import { useMaxBridge } from '../bridge/useMaxBridge'
import { useBootstrap } from '../features/launch/useBootstrap'

const bootstrap = useBootstrap()
const bridge = useMaxBridge()
const tab = ref('book')
const tabs: TabItem[] = [
  { id: 'book', label: 'miniapp.tabs.book' },
  { id: 'mine', label: 'miniapp.tabs.mine' },
]
</script>

<template>
  <Container>
    <Stack :gap="4" class="home">
      <header class="home__header">
        <Heading k="content.brand.name" :level="1" />
        <Badge v-if="bridge.demo" k="miniapp.demo.badge" tone="accent" />
        <p class="home__address">{{ bootstrap.business.address }}</p>
      </header>
      <Tabs v-model="tab" :items="tabs" label="miniapp.tabs.label" />
      <footer class="home__legal">
        <Divider />
        <Link
          k="miniapp.legal.privacy"
          :href="bootstrap.legal.privacy_url"
          external
          @click.prevent="bridge.openLink(bootstrap.legal.privacy_url)"
        />
        <Link
          v-if="bootstrap.legal.terms_url"
          k="miniapp.legal.terms"
          :href="bootstrap.legal.terms_url"
          external
          @click.prevent="bridge.openLink(bootstrap.legal.terms_url)"
        />
        <details>
          <summary><Text k="miniapp.legal.operator" /></summary>
          <p>{{ bootstrap.legal.operator }}</p>
          <p>{{ bootstrap.legal.support }}</p>
        </details>
      </footer>
    </Stack>
  </Container>
</template>

<style scoped>
.home {
  padding-block: var(--space-4) max(var(--space-4), env(safe-area-inset-bottom));
}

.home__address {
  margin: 0;
  color: var(--color-text-muted);
}

.home__legal {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
</style>
