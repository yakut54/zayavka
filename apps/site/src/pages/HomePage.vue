<script setup lang="ts">
import siteConfig from '../../site.config'
import { lazySection } from '../composables/lazyHydration'
import { useSeo } from '../composables/useSeo'
import { faqJsonLd, localBusinessJsonLd } from '../seo/jsonld'

// Интерактивные секции гидратируются позже, статичные — никогда (их HTML уже готов).
const HeroSection = lazySection.idle(() => import('../sections/HeroSection.vue'))
const ServicesSection = lazySection.visible(() => import('../sections/ServicesSection.vue'))
const AdvantagesSection = lazySection.never(() => import('../sections/AdvantagesSection.vue'))
const PricesSection = lazySection.never(() => import('../sections/PricesSection.vue'))
const ProcessSection = lazySection.never(() => import('../sections/ProcessSection.vue'))
const FaqSection = lazySection.never(() => import('../sections/FaqSection.vue'))
const ContactsSection = lazySection.visible(() => import('../sections/ContactsSection.vue'))
const LeadFormSection = lazySection.visible(() => import('../sections/LeadFormSection.vue'))

useSeo({
  title: siteConfig.seo.title,
  description: siteConfig.seo.description,
  path: '/',
  fullTitle: true,
  jsonLd: [localBusinessJsonLd(siteConfig), faqJsonLd(siteConfig)],
})
</script>

<template>
  <HeroSection />
  <ServicesSection />
  <AdvantagesSection />
  <PricesSection />
  <ProcessSection />
  <FaqSection />
  <ContactsSection />
  <LeadFormSection />
</template>
