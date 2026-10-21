import {
  type Component,
  type HydrationStrategy,
  defineAsyncComponent,
  hydrateOnIdle,
  hydrateOnVisible,
} from 'vue'

/** Статичный блок: HTML остаётся из пререндера, JS секции не скачивается и не гидратируется. */
export const hydrateNever: HydrationStrategy = () => () => undefined

type Loader = () => Promise<{ default: Component }>

/**
 * Ленивая гидратация (Vue 3.5): пререндеренный HTML показывается сразу, а JS секции
 * выполняется позже — это разгружает главный поток до первой отрисовки (LCP, TBT).
 */
export const lazySection = {
  idle: (loader: Loader) => defineAsyncComponent({ loader, hydrate: hydrateOnIdle() }),
  visible: (loader: Loader) =>
    defineAsyncComponent({ loader, hydrate: hydrateOnVisible({ rootMargin: '300px' }) }),
  never: (loader: Loader) => defineAsyncComponent({ loader, hydrate: hydrateNever }),
}
