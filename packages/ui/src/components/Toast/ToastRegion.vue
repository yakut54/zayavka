<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import { useToast } from '../../composables/useToast'
import ToastView from './ToastView.vue'

const { t } = useI18n()
const toast = useToast()
const { items } = toast
</script>

<template>
  <div class="ui-toast-region" role="region" aria-live="polite" :aria-label="t('ui.toast.region')">
    <ToastView v-for="item in items" :key="item.id" :item="item" @dismiss="toast.dismiss" />
  </div>
</template>

<style scoped>
.ui-toast-region {
  position: fixed;
  inset-block-end: var(--space-4);
  inset-inline-end: var(--space-4);
  z-index: var(--z-toast);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  pointer-events: none;
}

.ui-toast-region > * {
  pointer-events: auto;
}

@media (max-width: 640px) {
  .ui-toast-region {
    inset-inline-start: var(--space-4);
  }
}
</style>
