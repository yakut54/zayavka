<script setup lang="ts">
import interCyrillic from '@fontsource-variable/inter/files/inter-cyrillic-wght-normal.woff2?url'
import { useHead } from '@unhead/vue'
import { RouterView } from 'vue-router'

import SiteLayout from './SiteLayout.vue'

// Оттенок бренда задаётся атрибутом <html>: токены читают --brand-hue.
useHead({
  htmlAttrs: { lang: 'ru' },
  meta: [{ name: 'theme-color', content: '#ffffff' }],
  link: [
    {
      rel: 'preload',
      as: 'font',
      type: 'font/woff2',
      href: interCyrillic,
      crossorigin: 'anonymous',
    },
  ],
})
</script>

<template>
  <SiteLayout>
    <RouterView />
  </SiteLayout>
</template>
