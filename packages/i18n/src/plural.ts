/**
 * Русские формы множественного числа для vue-i18n.
 * Сообщение с четырьмя формами: «нет заявок | {n} заявка | {n} заявки | {n} заявок».
 * С тремя: «{n} заявка | {n} заявки | {n} заявок» (0 → третья форма).
 */
export function ruPluralRule(choice: number, choicesLength: number): number {
  const abs = Math.abs(choice)
  if (choicesLength === 4 && abs === 0) return 0
  const offset = choicesLength === 4 ? 1 : 0
  const lastTwo = abs % 100
  const last = abs % 10
  if (lastTwo > 10 && lastTwo < 20) return offset + 2
  if (last === 1) return offset
  if (last >= 2 && last <= 4) return offset + 1
  return offset + 2
}
