<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'

const sentinel = ref<HTMLElement | null>(null)
/** Контент уходит под панель: сам маркер над панелью вне экрана. */
const elevated = ref(false)
let observer: IntersectionObserver | undefined

onMounted(() => {
  if (!sentinel.value || typeof IntersectionObserver === 'undefined') return
  observer = new IntersectionObserver(([entry]) => {
    elevated.value = entry ? !entry.isIntersecting : false
  })
  observer.observe(sentinel.value)
})

onBeforeUnmount(() => observer?.disconnect())
</script>

<template>
  <div ref="sentinel" class="ui-bottom-bar__sentinel" aria-hidden="true" />
  <div :class="['ui-bottom-bar', { 'ui-bottom-bar--elevated': elevated }]">
    <div v-if="$slots.secondary" class="ui-bottom-bar__secondary"><slot name="secondary" /></div>
    <div class="ui-bottom-bar__primary"><slot name="primary" /></div>
  </div>
</template>

<style scoped>
.ui-bottom-bar__sentinel {
  block-size: 1px;
  margin-block-start: -1px;
}

.ui-bottom-bar {
  position: sticky;
  inset-block-end: 0;
  z-index: var(--z-header);
  display: flex;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  padding-block-end: calc(var(--space-3) + env(safe-area-inset-bottom, 0px));
  border-block-start: 1px solid var(--color-border);
  background: var(--color-surface);
  transition: box-shadow var(--duration-normal) var(--ease-standard);
}

.ui-bottom-bar--elevated {
  box-shadow: var(--shadow-md);
}

.ui-bottom-bar__primary {
  flex: 1 1 auto;
  min-inline-size: 0;
}

.ui-bottom-bar__secondary {
  flex: 0 0 auto;
}
</style>
