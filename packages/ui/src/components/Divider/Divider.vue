<script setup lang="ts">
withDefaults(defineProps<{ orientation?: 'horizontal' | 'vertical' }>(), {
  orientation: 'horizontal',
})
</script>

<template>
  <hr v-if="orientation === 'horizontal'" class="ui-divider ui-divider--horizontal" />
  <span
    v-else
    class="ui-divider ui-divider--vertical"
    role="separator"
    aria-orientation="vertical"
  />
</template>

<style scoped>
.ui-divider {
  border: 0;
  background: var(--color-border-strong);
  margin: 0;
}

.ui-divider--horizontal {
  height: 1px;
  width: 100%;
}

.ui-divider--vertical {
  display: inline-block;
  align-self: stretch;
  width: 1px;
  min-height: 1em;
}
</style>
