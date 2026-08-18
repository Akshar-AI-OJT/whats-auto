import type { ApiError, ContactSummary } from '@/lib/api'

const TAG_ERROR_CODE_KEYS: Record<string, string> = {
  E_TAG_NOT_FOUND: 'errors.notFound',
  E_TAG_NAME_EXISTS: 'errors.nameExists',
  E_TAG_ASSIGNMENT_EXISTS: 'errors.alreadyMember',
  E_TAG_ASSIGNMENT_NOT_FOUND: 'errors.removeFailed',
  E_TAG_INVALID_CONTACT: 'errors.invalidContact',
  E_TAG_EMPTY_UPDATE: 'errors.saveFailed',
  PERMISSION_DENIED: 'errors.permissionDenied',
}

function isApiErrorLike(error: unknown): error is ApiError {
  return Boolean(error && typeof error === 'object' && 'message' in error)
}

/** Replace backend "tag" wording so the product UI stays on Customer Group. */
export function remapTagErrorMessage(error: Pick<ApiError, 'message' | 'code'> | string): string {
  const raw = typeof error === 'string' ? error : error.message
  const code = typeof error === 'string' ? undefined : error.code
  if (code === 'E_TAG_NOT_FOUND') return 'This customer group could not be found.'
  if (code === 'E_TAG_NAME_EXISTS') return 'A group with this name already exists.'
  if (code === 'E_TAG_ASSIGNMENT_EXISTS') return 'This contact is already in the group.'
  if (code === 'E_TAG_ASSIGNMENT_NOT_FOUND') return 'This contact is not in the group.'
  if (code === 'E_TAG_INVALID_CONTACT') return 'That contact could not be found in this workspace.'
  if (code === 'E_TAG_EMPTY_UPDATE') return 'No changes were provided.'
  return raw
    .replace(/\btag assignment\b/gi, 'group membership')
    .replace(/\bthe tag\b/gi, 'the group')
    .replace(/\ba tag\b/gi, 'a group')
    .replace(/\btags\b/gi, 'groups')
    .replace(/\btag\b/gi, 'group')
    .replace(/\bTag\b/g, 'Group')
}

export function customerGroupErrorMessage(
  error: unknown,
  t: (key: string) => string,
  fallbackKey: string
): string {
  const err = isApiErrorLike(error) ? error : null
  if (err?.code && TAG_ERROR_CODE_KEYS[err.code]) {
    return t(TAG_ERROR_CODE_KEYS[err.code]!)
  }
  if (err?.status === 401 || err?.status === 403) return t('errors.permissionDenied')
  if (err?.status === 404) return t('errors.notFound')
  if (err?.message?.trim()) return remapTagErrorMessage(err)
  if (error instanceof Error && error.message.trim()) return remapTagErrorMessage(error.message)
  return t(fallbackKey)
}

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
