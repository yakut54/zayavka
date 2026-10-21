<script setup lang="ts">
import type { MessageArgs, MessageKey } from '@app/i18n'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

export type TextVariant =
  'display' | 'h1' | 'h2' | 'h3' | 'body-lg' | 'body' | 'body-sm' | 'caption' | 'label' | 'code'
export type TextTone = 'default' | 'muted' | 'accent' | 'danger' | 'success' | 'warning' | 'inverse'

const props = withDefaults(
  defineProps<{
    k: MessageKey
    args?: MessageArgs
    plural?: number
    as?: 'span' | 'p' | 'div' | 'strong' | 'em' | 'label' | 'small' | 'li' | 'dt' | 'dd'
    variant?: TextVariant
    tone?: TextTone
    weight?: 'regular' | 'medium' | 'semibold' | 'bold'
    align?: 'start' | 'center' | 'end'
    lines?: number
  }>(),
  {
    as: 'span',
    variant: 'body',
    tone: 'default',
    align: 'start',
  },
)

const { t } = useI18n()

const content = computed(() => {
  if (props.plural !== undefined) {
    const named = Array.isArray(props.args) ? {} : (props.args ?? {})
    return t(props.k, { n: props.plural, ...named }, props.plural)
  }
  if (props.args === undefined) return t(props.k)
  return Array.isArray(props.args) ? t(props.k, props.args) : t(props.k, props.args)
})

const classes = computed(() => [
  'ui-text',
  `ui-text--${props.variant}`,
  `ui-text--tone-${props.tone}`,
  props.weight && `ui-text--w-${props.weight}`,
  `ui-text--align-${props.align}`,
  props.lines && 'ui-text--clamp',
])
</script>

<template>
  <component :is="as" :class="classes" :style="lines ? { '--ui-text-lines': lines } : undefined">{{
    content
  }}</component>
</template>

<style scoped>
.ui-text {
  margin: 0;
  font-family: var(--font-sans);
  color: var(--color-text);
}

.ui-text--display {
  font-size: var(--text-display);
  line-height: var(--leading-tight);
  font-weight: 800;
  letter-spacing: -0.02em;
}

.ui-text--h1 {
  font-size: var(--text-3xl);
  line-height: var(--leading-tight);
  font-weight: 700;
  letter-spacing: -0.01em;
}

.ui-text--h2 {
  font-size: var(--text-2xl);
  line-height: var(--leading-tight);
  font-weight: 700;
}

.ui-text--h3 {
  font-size: var(--text-xl);
  line-height: var(--leading-tight);
  font-weight: 600;
}

.ui-text--body-lg {
  font-size: var(--text-lg);
  line-height: var(--leading-normal);
}

.ui-text--body {
  font-size: var(--text-md);
  line-height: var(--leading-normal);
}

.ui-text--body-sm {
  font-size: var(--text-sm);
  line-height: var(--leading-normal);
}

.ui-text--caption {
  font-size: var(--text-xs);
  line-height: var(--leading-normal);
}

.ui-text--label {
  font-size: var(--text-sm);
  line-height: var(--leading-normal);
  font-weight: 600;
}

.ui-text--code {
  font-family: var(--font-mono);
  font-size: var(--text-sm);
}

.ui-text--tone-muted {
  color: var(--color-text-muted);
}

.ui-text--tone-accent {
  color: var(--color-accent);
}

.ui-text--tone-danger {
  color: var(--color-danger);
}

.ui-text--tone-success {
  color: var(--color-success);
}

.ui-text--tone-warning {
  color: var(--color-warning);
}

.ui-text--tone-inverse {
  color: var(--color-text-inverse);
}

.ui-text--w-regular {
  font-weight: 400;
}

.ui-text--w-medium {
  font-weight: 500;
}

.ui-text--w-semibold {
  font-weight: 600;
}

.ui-text--w-bold {
  font-weight: 700;
}

.ui-text--align-start {
  text-align: start;
}

.ui-text--align-center {
  text-align: center;
}

.ui-text--align-end {
  text-align: end;
}

.ui-text--clamp {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: var(--ui-text-lines);
  line-clamp: var(--ui-text-lines);
  overflow: hidden;
}
</style>
