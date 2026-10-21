<script setup lang="ts">
import { Text } from '@app/ui'
import { onMounted } from 'vue'

import siteConfig from '../site.config'
import { initAnalytics } from './composables/useAnalytics'
import { lazySection } from './composables/lazyHydration'
import CookieBanner from './sections/CookieBanner.vue'
import SiteHeader from './sections/SiteHeader.vue'

const SiteFooter = lazySection.never(() => import('./sections/SiteFooter.vue'))
const hasAnalytics = siteConfig.analytics.yandexMetrikaId !== null

onMounted(() => initAnalytics(siteConfig.analytics.yandexMetrikaId))
</script>

<template>
  <a class="skip-link" href="#content">
    <Text k="nav.skipToContent" as="span" />
  </a>
  <SiteHeader />
  <main id="content" tabindex="-1">
    <slot />
  </main>
  <SiteFooter />
  <CookieBanner v-if="hasAnalytics" />
</template>

<style scoped>
.skip-link {
  position: absolute;
  inset-block-start: var(--space-2);
  inset-inline-start: var(--space-2);
  z-index: calc(var(--z-header) + 1);
  transform: translateY(-200%);
  padding: var(--space-2) var(--space-4);
  border-radius: var(--radius-md);
  background: var(--color-accent);
  text-decoration: none;
}

.skip-link:focus {
  transform: none;
}

.skip-link :deep(.ui-text) {
  color: var(--color-text-inverse);
}

main:focus {
  outline: none;
}
</style>
