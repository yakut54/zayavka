import { ref } from 'vue'

/** Услуга, выбранная в карточке: форма подхватывает её в `Select`. */
export const selectedService = ref('')

export const LEAD_FORM_ID = 'lead-form'

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** Плавно прокручивает к форме и ставит фокус на первое поле. */
export function scrollToLeadForm(): void {
  const section = document.getElementById(LEAD_FORM_ID)
  if (!section) return
  section.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' })
  const first = section.querySelector<HTMLElement>('input[name="name"]')
  first?.focus({ preventScroll: true })
}

export function chooseService(slug: string): void {
  selectedService.value = slug
  scrollToLeadForm()
}
