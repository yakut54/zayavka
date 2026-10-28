import type { MessageArgs, MessageKey } from '@app/i18n'
import type { RouteLocationRaw } from 'vue-router'

import type { IconName } from '../Icon/icons'

export interface ButtonBaseProps {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'link'
  size?: 'sm' | 'md' | 'lg'
  type?: 'button' | 'submit' | 'reset'
  iconStart?: IconName
  iconEnd?: IconName
  loading?: boolean
  disabled?: boolean
  block?: boolean
  href?: string
  to?: RouteLocationRaw
}

export interface ButtonWithLabel extends ButtonBaseProps {
  label: MessageKey
  /** Подстановки в подпись: «Далее: {time}». */
  args?: MessageArgs
  iconOnly?: undefined
  ariaLabel?: undefined
}

export interface ButtonIconOnly extends ButtonBaseProps {
  iconOnly: IconName
  /** Обязателен для кнопки без текста. */
  ariaLabel: MessageKey
  label?: undefined
  args?: undefined
}

/** Либо `label`, либо пара `iconOnly` + `ariaLabel`; другая комбинация не компилируется. */
export type ButtonProps = ButtonWithLabel | ButtonIconOnly
