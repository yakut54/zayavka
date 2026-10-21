<script setup lang="ts">
withDefaults(defineProps<{ width?: string; height?: string; lines?: number }>(), {
  width: '100%',
  height: '1rem',
  lines: 1,
})
</script>

<template>
  <div class="ui-skeleton" aria-hidden="true">
    <span
      v-for="line in lines"
      :key="line"
      class="ui-skeleton__bar"
      :style="{ width: lines > 1 && line === lines ? '60%' : width, height }"
    />
  </div>
</template>

<style scoped>
.ui-skeleton {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.ui-skeleton__bar {
  display: block;
  border-radius: var(--radius-sm);
  background: linear-gradient(
    90deg,
    var(--color-surface-muted) 25%,
    var(--color-border) 50%,
    var(--color-surface-muted) 75%
  );
  background-size: 200% 100%;
  animation: ui-shimmer 1.4s linear infinite;
}

@keyframes ui-shimmer {
  from {
    background-position: 200% 0;
  }

  to {
    background-position: -200% 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .ui-skeleton__bar {
    animation: none;
    background: var(--color-surface-muted);
  }
}
</style>
