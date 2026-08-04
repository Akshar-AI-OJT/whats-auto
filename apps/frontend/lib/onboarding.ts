/** Client-side onboarding helpers — no backend coupling beyond API contracts. */

const PENDING_PHONE_KEY = 'wa-onboarding-phone'
const PENDING_EMAIL_KEY = 'wa-onboarding-email'
const CHECKLIST_KEY = 'wa-onboarding-checklist'

export const ORG_SETUP_PATH = '/onboarding/organization'
export const TEAM_MEMBERS_PATH = '/dashboard/team'
export const ASSIGNABLE_ROLES = ['admin', 'agent', 'viewer'] as const
export type AssignableRole = (typeof ASSIGNABLE_ROLES)[number]

/** Lowercase hyphenated slug from a display name. */
export function slugifyOrganizationName(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 100)
}

/** Matches backend createOrganizationValidator slug rules. */
export function isValidOrganizationSlug(slug: string): boolean {
  return /^[a-z0-9-]+$/.test(slug) && slug.length >= 2 && slug.length <= 100
}

/** Practical international phone check (7–15 digits after stripping formatting). */
export function isValidPhone(value: string): boolean {
  const trimmed = value.trim()
  if (!trimmed) return false
  if (!/^\+?[0-9\s\-().]+$/.test(trimmed)) return false
  const digits = trimmed.replace(/\D/g, '')
  return digits.length >= 7 && digits.length <= 15
}

export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

/** Matches backend vine.string().url() expectations for optional website. */
export function isValidWebsiteUrl(value: string): boolean {
  const trimmed = value.trim()
  if (!trimmed) return false
  try {
    const url = new URL(trimmed)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

export function savePendingOnboardingContact(input: {
  email: string
  phone: string
}) {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.setItem(PENDING_EMAIL_KEY, input.email.trim())
    window.sessionStorage.setItem(PENDING_PHONE_KEY, input.phone.trim())
  } catch {
    /* ignore quota / private mode */
  }
}

export function readPendingOnboardingContact(): {
  email: string
  phone: string
} {
  if (typeof window === 'undefined') {
    return { email: '', phone: '' }
  }
  try {
    return {
      email: window.sessionStorage.getItem(PENDING_EMAIL_KEY) ?? '',
      phone: window.sessionStorage.getItem(PENDING_PHONE_KEY) ?? '',
    }
  } catch {
    return { email: '', phone: '' }
  }
}

export function clearPendingOnboardingContact() {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.removeItem(PENDING_EMAIL_KEY)
    window.sessionStorage.removeItem(PENDING_PHONE_KEY)
  } catch {
    /* ignore */
  }
}

/**
 * Organizations now come from the API, but earlier builds cached them in
 * localStorage, which is shared across accounts on the same browser. Drop the
 * old keys so testers don't keep another account's workspaces around.
 */
const LEGACY_ORG_CACHE_KEYS = [
  'wa-local-organizations',
  'wa-local-active-organization',
]

export function clearLegacyOrganizationCache() {
  if (typeof window === 'undefined') return
  try {
    LEGACY_ORG_CACHE_KEYS.forEach((key) => window.localStorage.removeItem(key))
  } catch {
    /* ignore */
  }
}

/** Common IANA zones for the company-info dropdown (browser zone always prepended). */
export const COMMON_TIMEZONES = [
  'Asia/Kolkata',
  'Asia/Dubai',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Australia/Sydney',
  'UTC',
] as const

/** Browser IANA zone first, then common zones — user must still pick one in the form. */
export function getTimezoneOptions(): string[] {
  const browserZone =
    typeof Intl !== 'undefined'
      ? Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
      : 'UTC'
  return Array.from(new Set([browserZone, ...COMMON_TIMEZONES]))
}

/**
 * Maps wizard state to the POST /api/v1/organizations request body.
 * Only includes optional keys when the user provided a value.
 */
export function buildCreateOrganizationPayload(input: {
  name: string
  slug: string
  email: string
  phone?: string
  website?: string
  industry?: string
  country: string
  timezone: string
  currency?: string
}) {
  const payload: {
    name: string
    slug: string
    email: string
    country: string
    timezone: string
    phone?: string
    website?: string
    industry?: string
    currency?: string
  } = {
    name: input.name.trim(),
    slug: input.slug.trim(),
    email: input.email.trim(),
    country: input.country.trim(),
    timezone: input.timezone.trim(),
  }

  const phone = input.phone?.trim()
  if (phone) payload.phone = phone

  const website = input.website?.trim()
  if (website) payload.website = website

  const industry = input.industry?.trim()
  if (industry) payload.industry = industry

  const currency = input.currency?.trim()
  if (currency) payload.currency = currency

  return payload
}

const PREFERENCES_KEY = 'wa-workspace-preferences'

export type PendingWorkspacePreferences = {
  companySize: string
  logoFileName: string
  defaultLanguage: string
  dateFormat: string
  timeFormat: string
  themePreference: string
  notifications: string[]
}

export function savePendingWorkspacePreferences(
  prefs: PendingWorkspacePreferences
) {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.setItem(PREFERENCES_KEY, JSON.stringify(prefs))
  } catch {
    /* ignore */
  }
}

export function clearPendingWorkspacePreferences() {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.removeItem(PREFERENCES_KEY)
  } catch {
    /* ignore */
  }
}

export function markOnboardingChecklistVisible() {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.setItem(CHECKLIST_KEY, '1')
    window.dispatchEvent(new Event('wa-onboarding-checklist-change'))
  } catch {
    /* ignore */
  }
}

export function isOnboardingChecklistVisible(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.sessionStorage.getItem(CHECKLIST_KEY) === '1'
  } catch {
    return false
  }
}

export function dismissOnboardingChecklist() {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.removeItem(CHECKLIST_KEY)
    window.dispatchEvent(new Event('wa-onboarding-checklist-change'))
  } catch {
    /* ignore */
  }
}
