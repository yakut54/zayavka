<script setup lang="ts">
import { ToastRegion } from '@app/ui'
import { RouterView, useRoute } from 'vue-router'

import AppShell from './layouts/AppShell.vue'

const route = useRoute()
</script>

<template>
  <AppShell v-if="route.meta.shell">
    <RouterView />
  </AppShell>
  <RouterView v-else />
  <ToastRegion />
</template>
