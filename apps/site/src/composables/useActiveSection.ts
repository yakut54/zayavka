import { onBeforeUnmount, onMounted, ref } from 'vue'

/** id секции, находящейся в средней части экрана (IntersectionObserver). */
export function useActiveSection(ids: readonly string[]) {
  const active = ref<string | null>(null)
  let observer: IntersectionObserver | undefined

  onMounted(() => {
    if (!('IntersectionObserver' in window)) return
    observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) active.value = entry.target.id
        }
      },
      { rootMargin: '-40% 0px -55% 0px' },
    )
    for (const id of ids) {
      const el = document.getElementById(id)
      if (el) observer.observe(el)
    }
  })

  onBeforeUnmount(() => observer?.disconnect())

  return active
}
