<script setup lang="ts">
import type { MessageKey } from '@app/i18n'

import Button from '../Button/Button.vue'
import type { IconName } from '../Icon/icons'

withDefaults(
  defineProps<{
    iconOnly: IconName
    ariaLabel: MessageKey
    variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
    size?: 'sm' | 'md' | 'lg'
    loading?: boolean
    disabled?: boolean
    type?: 'button' | 'submit' | 'reset'
  }>(),
  { variant: 'ghost', size: 'md', type: 'button' },
)
</script>

<template>
  <Button
    :icon-only="iconOnly"
    :ariaLabel="ariaLabel"
    :variant="variant"
    :size="size"
    :loading="loading"
    :disabled="disabled"
    :type="type"
  />
</template>
