<script setup lang="ts">
withDefaults(defineProps<{ as?: 'span' | 'div' }>(), { as: 'span' })
</script>

<template>
  <component :is="as" class="ui-visually-hidden"><slot /></component>
</template>

<style scoped>
.ui-visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
  border: 0;
}
</style>
