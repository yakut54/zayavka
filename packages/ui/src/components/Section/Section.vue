<script setup lang="ts">
withDefaults(
  defineProps<{
    id?: string
    tone?: 'default' | 'muted' | 'accent'
    spacing?: 'sm' | 'md' | 'lg'
    /** id заголовка секции (aria-labelledby). */
    labelledby?: string
  }>(),
  { tone: 'default', spacing: 'md' },
)
</script>

<template>
  <section
    :id="id"
    :aria-labelledby="labelledby"
    :class="['ui-section', `ui-section--${tone}`, `ui-section--${spacing}`]"
  >
    <slot />
  </section>
</template>

<style scoped>
.ui-section {
  scroll-margin-top: var(--space-20);
  background: var(--color-bg);
}

.ui-section--muted {
  background: var(--color-surface-muted);
}

.ui-section--accent {
  background: var(--color-accent-subtle);
}

.ui-section--sm {
  padding-block: var(--space-8);
}

.ui-section--md {
  padding-block: var(--space-12);
}

.ui-section--lg {
  padding-block: var(--space-16);
}

@media (min-width: 768px) {
  .ui-section--md {
    padding-block: var(--space-16);
  }

  .ui-section--lg {
    padding-block: var(--space-20);
  }
}
</style>
