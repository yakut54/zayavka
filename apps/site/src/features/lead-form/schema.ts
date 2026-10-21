import { z } from 'zod'

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Правила клиента = сервера (раздел 12.3 ТЗ). Сообщение каждого правила — код ошибки поля:
 * `useForm` превращает его в ключ `errors.field.<код>`.
 */
export const leadSchema = z.object({
  name: z.string().trim().min(1, 'required').min(2, 'too_short').max(100, 'too_long'),
  phone: z
    .string()
    .min(1, 'required')
    .regex(/^7\d{10}$/, 'phone_invalid'),
  email: z
    .string()
    .trim()
    .max(254, 'too_long')
    .refine((value) => value === '' || EMAIL.test(value), 'email_invalid'),
  serviceSlug: z.string(),
  message: z.string().max(2000, 'too_long'),
  consent: z.boolean().refine((value) => value, 'consent_required'),
})

export type LeadFormValues = z.input<typeof leadSchema>

export const leadInitial: LeadFormValues & { website: string } = {
  name: '',
  phone: '',
  email: '',
  serviceSlug: '',
  message: '',
  // Чекбокс согласия не отмечен по умолчанию (ТЗ-1 §14, ошибка №1).
  consent: false,
  website: '',
}
