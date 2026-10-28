<script setup lang="ts">
import { ToastRegion } from '@app/ui'
import { RouterView } from 'vue-router'

import LaunchGate from './features/launch/LaunchGate.vue'
</script>

<template>
  <LaunchGate>
    <RouterView />
  </LaunchGate>
  <ToastRegion />
</template>
