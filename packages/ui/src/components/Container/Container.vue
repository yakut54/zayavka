<script setup lang="ts">
withDefaults(
  defineProps<{
    size?: 'sm' | 'md' | 'lg' | 'xl'
    as?: 'div' | 'main' | 'header' | 'footer' | 'nav'
  }>(),
  { size: 'lg', as: 'div' },
)
</script>

<template>
  <component :is="as" :class="['ui-container', `ui-container--${size}`]"><slot /></component>
</template>

<style scoped>
.ui-container {
  width: 100%;
  margin-inline: auto;
  padding-inline: var(--space-4);
}

.ui-container--sm {
  max-width: var(--container-sm);
}

.ui-container--md {
  max-width: var(--container-md);
}

.ui-container--lg {
  max-width: var(--container-lg);
}

.ui-container--xl {
  max-width: var(--container-xl);
}

@media (min-width: 640px) {
  .ui-container {
    padding-inline: var(--space-6);
  }
}
</style>
