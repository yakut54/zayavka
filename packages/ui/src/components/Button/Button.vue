<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'

import Icon from '../Icon/Icon.vue'
import Spinner from '../Spinner/Spinner.vue'
import Text from '../Text/Text.vue'
import type { ButtonProps } from './types'

const props = withDefaults(defineProps<ButtonProps>(), {
  variant: 'primary',
  size: 'md',
  type: 'button',
})

const emit = defineEmits<{ click: [event: MouseEvent] }>()

const { t } = useI18n()

const inactive = computed(() => props.loading === true || props.disabled === true)
const tag = computed(() => (props.to !== undefined ? RouterLink : props.href ? 'a' : 'button'))
const isNativeButton = computed(() => tag.value === 'button')

const linkProps = computed(() =>
  props.to !== undefined ? { to: props.to } : props.href ? { href: props.href } : {},
)

const classes = computed(() => [
  'ui-button',
  `ui-button--${props.variant}`,
  `ui-button--${props.size}`,
  {
    'ui-button--block': props.block,
    'ui-button--icon-only': props.iconOnly !== undefined,
    'ui-button--loading': props.loading,
    'ui-button--disabled': props.disabled,
  },
])

const attrs = computed(() => ({
  ...linkProps.value,
  ...(isNativeButton.value ? { type: props.type, disabled: inactive.value } : {}),
  ...(!isNativeButton.value && inactive.value ? { 'aria-disabled': 'true', tabindex: -1 } : {}),
  ...(props.loading ? { 'aria-busy': 'true' } : {}),
  ...(props.ariaLabel ? { 'aria-label': t(props.ariaLabel) } : {}),
}))

function onClick(event: MouseEvent): void {
  if (inactive.value) {
    event.preventDefault()
    event.stopPropagation()
    return
  }
  emit('click', event)
}
</script>

<template>
  <component :is="tag" :class="classes" v-bind="attrs" @click="onClick">
    <span class="ui-button__content">
      <Icon v-if="iconStart" :name="iconStart" size="md" />
      <Icon v-if="iconOnly" :name="iconOnly" size="md" />
      <Text
        v-if="label"
        :k="label"
        :args="args"
        variant="label"
        as="span"
        class="ui-button__label"
      />
      <Icon v-if="iconEnd" :name="iconEnd" size="md" />
    </span>
    <span v-if="loading" class="ui-button__spinner"><Spinner size="sm" /></span>
  </component>
</template>

<style scoped>
.ui-button {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  min-height: var(--control-height-md);
  padding: 0 var(--space-5);
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  font-family: var(--font-sans);
  font-size: var(--text-md);
  font-weight: 600;
  line-height: 1;
  text-decoration: none;
  white-space: nowrap;
  cursor: pointer;
  user-select: none;
  transition:
    background-color var(--duration-fast) var(--ease-standard),
    border-color var(--duration-fast) var(--ease-standard),
    transform var(--duration-fast) var(--ease-standard);
}

.ui-button :deep(.ui-text) {
  color: inherit;
}

.ui-button__content {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
}

.ui-button:active:not(.ui-button--disabled, .ui-button--loading) {
  transform: translateY(1px);
}

.ui-button:focus-visible {
  outline: var(--focus-ring-width) solid var(--color-focus-ring);
  outline-offset: var(--focus-ring-offset);
}

/* размеры */
.ui-button--sm {
  min-height: var(--control-height-sm);
  padding: 0 var(--space-3);
  font-size: var(--text-sm);
}

.ui-button--lg {
  min-height: var(--control-height-lg);
  padding: 0 var(--space-8);
  font-size: var(--text-lg);
}

.ui-button--icon-only {
  width: var(--control-height-md);
  padding: 0;
}

.ui-button--icon-only.ui-button--sm {
  width: var(--control-height-sm);
}

.ui-button--icon-only.ui-button--lg {
  width: var(--control-height-lg);
}

.ui-button--block {
  display: flex;
  width: 100%;
}

/* зона нажатия 44×44 на сенсорных экранах (для sm — псевдоэлементом) */
@media (pointer: coarse) {
  .ui-button--sm::after {
    content: '';
    position: absolute;
    inset: 50% auto auto 50%;
    width: max(100%, 44px);
    height: 44px;
    transform: translate(-50%, -50%);
  }
}

/* варианты */
.ui-button--primary {
  background: var(--color-accent);
  color: var(--color-text-inverse);
}

.ui-button--primary:hover:not(.ui-button--disabled, .ui-button--loading) {
  background: var(--color-accent-hover);
}

.ui-button--secondary {
  background: var(--color-surface);
  color: var(--color-text);
  border-color: var(--color-border-input);
}

.ui-button--secondary:hover:not(.ui-button--disabled, .ui-button--loading) {
  background: var(--color-surface-muted);
}

.ui-button--ghost {
  background: transparent;
  color: var(--color-accent);
}

.ui-button--ghost:hover:not(.ui-button--disabled, .ui-button--loading) {
  background: var(--color-accent-subtle);
}

.ui-button--danger {
  background: var(--color-danger);
  color: var(--color-surface);
}

.ui-button--danger:hover:not(.ui-button--disabled, .ui-button--loading) {
  filter: brightness(0.92);
}

.ui-button--link {
  min-height: auto;
  padding: 0;
  background: transparent;
  color: var(--color-accent);
  text-decoration: underline;
  text-underline-offset: 0.2em;
}

.ui-button--link:hover:not(.ui-button--disabled, .ui-button--loading) {
  color: var(--color-accent-hover);
}

/* disabled */
.ui-button--disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.ui-button:disabled {
  cursor: not-allowed;
}

/* loading: текст остаётся в разметке, но прозрачный — ширина не прыгает */
.ui-button--loading {
  cursor: progress;
}

.ui-button--loading .ui-button__content {
  opacity: 0;
}

.ui-button__spinner {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
