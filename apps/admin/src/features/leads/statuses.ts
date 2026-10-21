import type { MessageKey } from '@app/i18n'

export type LeadStatus = 'new' | 'in_progress' | 'done' | 'spam' | 'archived'
export type BadgeTone = 'accent' | 'warning' | 'success' | 'danger' | 'muted'

export const STATUSES: LeadStatus[] = ['new', 'in_progress', 'done', 'spam', 'archived']

export const STATUS_TONE: Record<LeadStatus, BadgeTone> = {
  new: 'accent',
  in_progress: 'warning',
  done: 'success',
  spam: 'danger',
  archived: 'muted',
}

export const statusLabel = (status: LeadStatus): MessageKey => `status.${status}`

export const isLeadStatus = (value: unknown): value is LeadStatus =>
  typeof value === 'string' && (STATUSES as string[]).includes(value)
