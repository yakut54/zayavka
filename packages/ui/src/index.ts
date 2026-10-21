// Публичный индекс @app/ui: приложения импортируют только отсюда.
export { default as Accordion } from './components/Accordion/Accordion.vue'
export type { AccordionItem } from './components/Accordion/Accordion.vue'
export { default as Alert } from './components/Alert/Alert.vue'
export { default as Badge } from './components/Badge/Badge.vue'
export { default as Button } from './components/Button/Button.vue'
export type { ButtonProps } from './components/Button/types'
export { default as Checkbox } from './components/Checkbox/Checkbox.vue'
export { default as Container } from './components/Container/Container.vue'
export { default as DataTable } from './components/DataTable/DataTable.vue'
export type {
  DataTableColumn,
  DataTableRow,
  DataTableSort,
} from './components/DataTable/DataTable.vue'
export { default as Dialog } from './components/Dialog/Dialog.vue'
export { default as Divider } from './components/Divider/Divider.vue'
export { default as Drawer } from './components/Drawer/Drawer.vue'
export { default as EmptyState } from './components/EmptyState/EmptyState.vue'
export { default as ErrorState } from './components/ErrorState/ErrorState.vue'
export { default as Field } from './components/Field/Field.vue'
export { default as Grid } from './components/Grid/Grid.vue'
export { default as Heading } from './components/Heading/Heading.vue'
export { default as Icon } from './components/Icon/Icon.vue'
export { type IconName, icons } from './components/Icon/icons'
export { default as IconButton } from './components/IconButton/IconButton.vue'
export { default as Inline } from './components/Inline/Inline.vue'
export { default as Input } from './components/Input/Input.vue'
export { default as Link } from './components/Link/Link.vue'
export { default as PasswordInput } from './components/PasswordInput/PasswordInput.vue'
export { default as PhoneInput } from './components/PhoneInput/PhoneInput.vue'
export { default as Pagination } from './components/Pagination/Pagination.vue'
export { default as SearchInput } from './components/SearchInput/SearchInput.vue'
export { default as Section } from './components/Section/Section.vue'
export { default as Select } from './components/Select/Select.vue'
export type { SelectOption } from './components/Select/Select.vue'
export { default as Skeleton } from './components/Skeleton/Skeleton.vue'
export { default as Spinner } from './components/Spinner/Spinner.vue'
export { default as Stack } from './components/Stack/Stack.vue'
export { default as Surface } from './components/Surface/Surface.vue'
export { default as Text } from './components/Text/Text.vue'
export type { TextTone, TextVariant } from './components/Text/Text.vue'
export { default as Textarea } from './components/Textarea/Textarea.vue'
export { default as ToastRegion } from './components/Toast/ToastRegion.vue'
export { default as VisuallyHidden } from './components/VisuallyHidden/VisuallyHidden.vue'
export type { SpaceToken } from './components/layout/types'

export { debounce } from './composables/useDebounce'
export {
  FIELD_ERROR_CODES,
  errorKey,
  useForm,
  type FieldBinding,
  type ServerFieldError,
} from './composables/useForm'
export {
  formatPhone,
  isCompletePhone,
  normalizePhoneDigits,
  usePhoneMask,
} from './composables/usePhoneMask'
export { type ToastOptions, useToast } from './composables/useToast'
export { breakpoints, type Breakpoint } from './tokens/breakpoints'
