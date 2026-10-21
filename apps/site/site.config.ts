import { defineSiteConfig } from './src/config/types'

/** Бренд и контент (white-label). Тексты — ключи словаря `content.*` пакета @app/i18n. */
export default defineSiteConfig({
  demo: true,
  url: 'https://example.ru',
  policyVersion: '2026-10-20',
  policyDate: '2026-10-20',
  brand: { name: 'content.brand.name', hue: 250 },
  hero: {
    title: 'content.hero.title',
    subtitle: 'content.hero.subtitle',
    imageAlt: 'content.hero.imageAlt',
  },
  contacts: {
    phoneE164: '+70000000000',
    email: 'hello@example.ru',
    address: 'content.contacts.address',
    workingHours: 'content.contacts.hours',
    timezone: 'Asia/Novosibirsk',
    map: { lat: 55.0415, lon: 82.9346, zoom: 15 },
  },
  services: [
    {
      slug: 'diagnostics',
      title: 'content.services.diagnostics.title',
      description: 'content.services.diagnostics.desc',
      priceFrom: 1500,
      icon: 'gauge',
    },
    {
      slug: 'maintenance',
      title: 'content.services.maintenance.title',
      description: 'content.services.maintenance.desc',
      priceFrom: 3500,
      icon: 'droplet',
    },
    {
      slug: 'brakes',
      title: 'content.services.brakes.title',
      description: 'content.services.brakes.desc',
      priceFrom: 2800,
      icon: 'shield',
    },
    {
      slug: 'tires',
      title: 'content.services.tires.title',
      description: 'content.services.tires.desc',
      priceFrom: 2000,
      icon: 'tire',
    },
  ],
  advantages: [
    { icon: 'eye', title: 'content.advantages.a1.title', text: 'content.advantages.a1.text' },
    {
      icon: 'check-circle',
      title: 'content.advantages.a2.title',
      text: 'content.advantages.a2.text',
    },
    { icon: 'shield', title: 'content.advantages.a3.title', text: 'content.advantages.a3.text' },
    { icon: 'wrench', title: 'content.advantages.a4.title', text: 'content.advantages.a4.text' },
  ],
  process: [
    { title: 'content.process.s1.title', text: 'content.process.s1.text' },
    { title: 'content.process.s2.title', text: 'content.process.s2.text' },
    { title: 'content.process.s3.title', text: 'content.process.s3.text' },
    { title: 'content.process.s4.title', text: 'content.process.s4.text' },
  ],
  faq: [
    { question: 'content.faq.q1', answer: 'content.faq.a1' },
    { question: 'content.faq.q2', answer: 'content.faq.a2' },
    { question: 'content.faq.q3', answer: 'content.faq.a3' },
    { question: 'content.faq.q4', answer: 'content.faq.a4' },
  ],
  seo: { title: 'content.seo.title', description: 'content.seo.description' },
  analytics: { yandexMetrikaId: null },
  leadForm: { callbackMinutes: 15 },
})
