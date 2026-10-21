<script setup lang="ts">
import {
  Button,
  Container,
  Heading,
  Inline,
  Link,
  Section,
  Stack,
  Text,
  formatPhone,
} from '@app/ui'
import { useHead } from '@unhead/vue'
import { useI18n } from 'vue-i18n'

import siteConfig from '../../site.config'
import { scrollToLeadForm } from '../composables/useLeadFormBus'
import hero1200Avif from '../assets/generated/hero-1200.avif?url'
import hero1200Jpg from '../assets/generated/hero-1200.jpg?url'
import hero1200Webp from '../assets/generated/hero-1200.webp?url'
import hero480Avif from '../assets/generated/hero-480.avif?url'
import hero480Webp from '../assets/generated/hero-480.webp?url'
import hero960Avif from '../assets/generated/hero-960.avif?url'
import hero960Webp from '../assets/generated/hero-960.webp?url'

const { t } = useI18n()
const phoneHref = `tel:${siteConfig.contacts.phoneE164}`
const phoneText = formatPhone(siteConfig.contacts.phoneE164.replace(/\D/g, ''))
const sizes = '(min-width: 1024px) 560px, (min-width: 768px) 50vw, 100vw'

// LCP-картинка: загрузка начинается до разбора разметки.
useHead({
  link: [
    {
      rel: 'preload',
      as: 'image',
      type: 'image/avif',
      imagesrcset: `${hero480Avif} 480w, ${hero960Avif} 960w, ${hero1200Avif} 1200w`,
      imagesizes: sizes,
      fetchpriority: 'high',
    },
  ],
})
</script>

<template>
  <Section spacing="lg" labelledby="hero-title">
    <Container size="xl">
      <div class="hero">
        <Stack :gap="6" align="start" class="hero__text">
          <Heading id="hero-title" :k="siteConfig.hero.title" :level="1" variant="display" />
          <Text :k="siteConfig.hero.subtitle" variant="body-lg" tone="muted" as="p" />
          <Inline :gap="3" wrap>
            <Button label="nav.cta" size="lg" @click="scrollToLeadForm" />
            <Button
              label="nav.call"
              size="lg"
              variant="secondary"
              icon-start="phone"
              :href="phoneHref"
            />
            <Link :href="phoneHref" :text="phoneText" class="hero__phone" />
          </Inline>
        </Stack>
        <picture class="hero__picture">
          <source
            type="image/avif"
            :srcset="`${hero480Avif} 480w, ${hero960Avif} 960w, ${hero1200Avif} 1200w`"
            :sizes="sizes"
          />
          <source
            type="image/webp"
            :srcset="`${hero480Webp} 480w, ${hero960Webp} 960w, ${hero1200Webp} 1200w`"
            :sizes="sizes"
          />
          <img
            :src="hero1200Jpg"
            :alt="t(siteConfig.hero.imageAlt)"
            width="1200"
            height="900"
            fetchpriority="high"
            decoding="async"
          />
        </picture>
      </div>
    </Container>
  </Section>
</template>

<style scoped>
.hero {
  display: grid;
  gap: var(--space-8);
  align-items: center;
}

.hero__picture img {
  width: 100%;
  height: auto;
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
}

.hero__phone {
  display: none;
}

@media (min-width: 768px) {
  .hero {
    grid-template-columns: 1fr 1fr;
    gap: var(--space-12);
  }

  .hero__phone {
    display: inline;
  }
}
</style>
