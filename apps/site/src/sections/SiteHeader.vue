<script setup lang="ts">
import type { MessageKey } from '@app/i18n'
import { Button, Container, Icon, IconButton, Link, Text, formatPhone } from '@app/ui'
import { defineAsyncComponent, onBeforeUnmount, onMounted, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'

import siteConfig from '../../site.config'
import { useActiveSection } from '../composables/useActiveSection'
import { scrollToLeadForm } from '../composables/useLeadFormBus'

const MobileMenu = defineAsyncComponent(() => import('./MobileMenu.vue'))

interface NavItem {
  id: string
  label: MessageKey
}

const NAV: NavItem[] = [
  { id: 'services', label: 'nav.services' },
  { id: 'prices', label: 'nav.prices' },
  { id: 'process', label: 'nav.process' },
  { id: 'faq', label: 'nav.faq' },
  { id: 'contacts', label: 'nav.contacts' },
]

const route = useRoute()
const router = useRouter()
const active = useActiveSection(NAV.map((item) => item.id))
const scrolled = ref(false)
const menuOpen = ref(false)
const menuMounted = ref(false)

const phoneHref = `tel:${siteConfig.contacts.phoneE164}`
const phoneText = formatPhone(siteConfig.contacts.phoneE164.replace(/\D/g, ''))

function onScroll(): void {
  scrolled.value = window.scrollY > 8
}

function openMenu(): void {
  menuMounted.value = true
  menuOpen.value = true
}

async function onCta(): Promise<void> {
  if (route.name === 'home') scrollToLeadForm()
  else await router.push({ path: '/', hash: '#lead-form' })
}

onMounted(() => {
  onScroll()
  window.addEventListener('scroll', onScroll, { passive: true })
})
onBeforeUnmount(() => window.removeEventListener('scroll', onScroll))
</script>

<template>
  <header :class="['site-header', { 'site-header--scrolled': scrolled }]">
    <Container size="xl">
      <div class="site-header__bar">
        <RouterLink to="/" class="site-header__logo" :aria-label="$t(siteConfig.brand.name)">
          <span class="site-header__mark"><Icon name="wrench" /></span>
          <Text :k="siteConfig.brand.name" variant="h3" as="span" />
        </RouterLink>

        <nav class="site-header__nav" :aria-label="$t('nav.mainNav')">
          <ul class="site-header__list">
            <li v-for="item in NAV" :key="item.id">
              <RouterLink
                :to="{ path: '/', hash: `#${item.id}` }"
                class="site-header__link"
                :aria-current="route.name === 'home' && active === item.id ? 'true' : undefined"
              >
                <Text :k="item.label" variant="body-sm" weight="medium" as="span" />
              </RouterLink>
            </li>
          </ul>
        </nav>

        <div class="site-header__actions">
          <Link :href="phoneHref" :text="phoneText" class="site-header__phone" />
          <Button label="nav.cta" size="sm" class="site-header__cta" @click="onCta" />
          <IconButton
            icon-only="menu"
            ariaLabel="nav.menu"
            class="site-header__burger"
            aria-controls="mobile-menu"
            :aria-expanded="menuOpen ? 'true' : 'false'"
            @click="openMenu"
          />
        </div>
      </div>
    </Container>
    <MobileMenu
      v-if="menuMounted"
      v-model:open="menuOpen"
      :nav="NAV"
      :phone-href="phoneHref"
      :phone-text="phoneText"
      :active="active"
      @cta="onCta"
    />
  </header>
</template>

<style scoped>
.site-header {
  position: sticky;
  inset-block-start: 0;
  z-index: var(--z-header);
  background: var(--color-surface);
  border-block-end: 1px solid var(--color-border);
  transition: box-shadow var(--duration-normal) var(--ease-standard);
}

.site-header--scrolled {
  box-shadow: var(--shadow-md);
}

.site-header__bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  min-height: 4rem;
}

.site-header__logo {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--color-text);
  text-decoration: none;
  border-radius: var(--radius-sm);
}

.site-header__mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  border-radius: var(--radius-md);
  background: var(--color-accent);
  color: var(--color-text-inverse);
}

.site-header__nav {
  display: none;
}

.site-header__list {
  display: flex;
  gap: var(--space-1);
  margin: 0;
  padding: 0;
  list-style: none;
}

.site-header__link {
  display: inline-flex;
  align-items: center;
  min-height: var(--control-height-md);
  padding: 0 var(--space-3);
  border-radius: var(--radius-md);
  color: var(--color-text);
  text-decoration: none;
}

.site-header__link:hover {
  background: var(--color-surface-muted);
}

.site-header__link[aria-current='true'] {
  background: var(--color-accent-subtle);
  color: var(--color-accent);
}

.site-header__link :deep(.ui-text) {
  color: inherit;
}

.site-header__actions {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.site-header__phone {
  display: none;
}

.site-header__cta {
  display: none;
}

@media (min-width: 768px) {
  .site-header__nav {
    display: block;
  }

  .site-header__cta {
    display: inline-flex;
  }

  .site-header__burger {
    display: none;
  }
}

@media (min-width: 1024px) {
  .site-header__phone {
    display: inline;
  }
}
</style>
