<script setup lang="ts">
import { Badge, Container, Divider, Heading, Link, Stack, Tabs, Text } from '@app/ui'
import type { TabItem } from '@app/ui'
import { useQuery } from '@tanstack/vue-query'
import { computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { useMaxBridge } from '../bridge/useMaxBridge'
import { fetchBookings } from '../features/booking/api'
import ServiceStep from '../features/booking/ServiceStep.vue'
import { useFlow } from '../features/booking/useFlow'
import MyBookings from '../features/bookings/MyBookings.vue'
import { useBootstrap } from '../features/launch/useBootstrap'
import { useBookingDraft } from '../stores/bookingDraft'

const bootstrap = useBootstrap()
const bridge = useMaxBridge()
const draft = useBookingDraft()
const flow = useFlow()
const route = useRoute()
const router = useRouter()

const tab = computed({
  get: () => (route.query.tab === 'mine' ? 'mine' : 'book'),
  set: (value: string) => void router.replace({ name: 'home', query: { tab: value } }),
})

// Число предстоящих записей — в бейдже вкладки «Мои записи».
const upcoming = useQuery({
  queryKey: ['bookings', 'count'],
  queryFn: () => fetchBookings('upcoming', 1),
  staleTime: 30_000,
})
const tabs = computed<TabItem[]>(() => [
  { id: 'book', label: 'miniapp.tabs.book' },
  {
    id: 'mine',
    label: 'miniapp.tabs.mine',
    ...(upcoming.data.value?.total ? { badge: upcoming.data.value.total } : {}),
  },
])

// Начало записи и параметр запуска s_<slug>: услуга предвыбрана, открывается следующий шаг.
onMounted(async () => {
  bridge.backButton.hide()
  const match = /^s_([a-z0-9-]{1,64})$/.exec(bridge.startParam ?? '')
  const slug = match?.[1]
  if (slug && !draft.serviceSlug && bootstrap.value.services.some((s) => s.slug === slug)) {
    draft.setService(slug)
    await flow.next('service')
  }
})
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
      <ServiceStep v-if="tab === 'book'" />
      <MyBookings v-else />
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
