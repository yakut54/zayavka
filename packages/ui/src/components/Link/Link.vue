<script setup lang="ts">
import type { MessageArgs, MessageKey } from '@app/i18n'
import { computed } from 'vue'
import { RouterLink, type RouteLocationRaw } from 'vue-router'

import Text from '../Text/Text.vue'
import VisuallyHidden from '../VisuallyHidden/VisuallyHidden.vue'

const props = withDefaults(
  defineProps<{
    k: MessageKey
    args?: MessageArgs
    href?: string
    to?: RouteLocationRaw
    external?: boolean
    tone?: 'default' | 'muted' | 'inverse'
  }>(),
  { tone: 'default' },
)

const isRouter = computed(() => props.to !== undefined)
const attrs = computed(() => {
  if (isRouter.value) return { to: props.to }
  return {
    href: props.href,
    ...(props.external ? { target: '_blank', rel: 'noopener noreferrer' } : {}),
  }
})
</script>

<template>
  <component
    :is="isRouter ? RouterLink : 'a'"
    :class="['ui-link', `ui-link--${tone}`]"
    v-bind="attrs"
  >
    <Text :k="k" :args="args" as="span" variant="body" weight="medium" class="ui-link__text" />
    <VisuallyHidden v-if="external"> (<Text k="common.opensInNewTab" />)</VisuallyHidden>
  </component>
</template>

<style scoped>
.ui-link {
  color: var(--color-accent);
  text-decoration: underline;
  text-underline-offset: 0.2em;
  border-radius: var(--radius-sm);
}

.ui-link :deep(.ui-text) {
  color: inherit;
  font: inherit;
}

.ui-link:hover {
  color: var(--color-accent-hover);
}

.ui-link--muted {
  color: var(--color-text-muted);
}

.ui-link--inverse {
  color: var(--color-text-inverse);
}
</style>
