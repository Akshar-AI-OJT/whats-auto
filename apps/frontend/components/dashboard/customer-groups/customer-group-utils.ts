import type { ContactSummary } from '@/lib/api'

export const CUSTOMER_GROUPS_PAGE_SIZE = 8

export function unwrapContacts(data: unknown): ContactSummary[] {
  if (Array.isArray(data)) return data as ContactSummary[]
  const wrapped = data as { data?: ContactSummary[] }
  return Array.isArray(wrapped.data) ? wrapped.data : []
}

export function contactDisplayName(contact: ContactSummary, unnamed: string) {
  return contact.name?.trim() || contact.phone || unnamed
}

export function initialsFromContact(contact: ContactSummary) {
  const source = (contact.name?.trim() || contact.phone).trim()
  const parts = source.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) {
    return `${parts[0]![0] ?? ''}${parts[1]![0] ?? ''}`.toUpperCase()
  }
  return source.slice(0, 2).toUpperCase() || '?'
}

export function formatGroupDate(value: string | null | undefined, locale?: string) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat(locale || undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date)
}

const GROUP_ACCENT = [
  'bg-positive/15 text-positive-deep',
  'bg-dash-info-soft text-dash-info',
  'bg-warning/15 text-warning-deep',
  'bg-dash-surface text-body',
] as const

export function groupAccentClass(name: string) {
  let hash = 0
  for (let i = 0; i < name.length; i += 1) {
    hash = (hash + name.charCodeAt(i)) % GROUP_ACCENT.length
  }
  return GROUP_ACCENT[hash] ?? GROUP_ACCENT[0]
}

export function groupInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length >= 2) {
    return `${parts[0]![0] ?? ''}${parts[1]![0] ?? ''}`.toUpperCase()
  }
  return name.trim().slice(0, 2).toUpperCase() || 'G'
}
