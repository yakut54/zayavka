import { z } from 'zod'

const nameRule = z.string().trim().min(1, 'required').min(2, 'too_short').max(100, 'too_long')
const phoneRule = z
  .string()
  .min(1, 'required')
  .regex(/^7\d{10}$/, 'phone_invalid')
const consentRule = z.boolean().refine((value) => value, 'consent_required')

/** Правила клиента = сервера; сообщение — код ошибки поля (useForm делает из него ключ). */
export const contactsSchema = z.object({
  name: nameRule,
  phone: phoneRule,
  comment: z.string().max(500, 'too_long'),
  consent: consentRule,
})

export const requestSchema = z.object({
  name: nameRule,
  phone: phoneRule,
  message: z.string().max(2000, 'too_long'),
  consent: consentRule,
})

/** Телефон из MAX приходит цифрами с кодом страны, иногда с «+» или с «8» в начале. */
export function normalizeContactPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  return digits.length === 11 && digits.startsWith('8') ? `7${digits.slice(1)}` : digits
}
