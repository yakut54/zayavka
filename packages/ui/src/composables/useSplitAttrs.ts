import { computed, useAttrs } from 'vue'

/**
 * Для контролов с обёрткой: `class` и `style` остаются на корне, остальные атрибуты
 * (id, aria-*, name, обработчики) уходят на нативный элемент. Пустой `style` не выводится:
 * строгий CSP (style-src 'self') считает нарушением даже `style=""` в HTML.
 */
export function useSplitAttrs() {
  const attrs = useAttrs()
  const rootAttrs = computed(() => ({
    ...(attrs.class ? { class: attrs.class } : {}),
    ...(attrs.style ? { style: attrs.style } : {}),
  }))
  const innerAttrs = computed(() => {
    const { class: _class, style: _style, ...rest } = attrs
    return rest
  })
  return { rootAttrs, innerAttrs }
}
