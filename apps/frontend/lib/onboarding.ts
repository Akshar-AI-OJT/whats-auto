/** Client-side onboarding helpers — no backend coupling beyond API contracts. */

const PENDING_PHONE_KEY = 'wa-onboarding-phone'
const PENDING_EMAIL_KEY = 'wa-onboarding-email'

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

/** Practical international phone check (7–20 digits after stripping formatting). */
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

const CHECKLIST_KEY = 'wa-onboarding-checklist'
const PREFERENCES_KEY = 'wa-workspace-preferences'
const LOCAL_ORGS_KEY = 'wa-local-organizations'
const LOCAL_ACTIVE_ORG_KEY = 'wa-local-active-organization'
export const LOCAL_ORGS_CHANGE_EVENT = 'wa-local-organizations-change'

/** Temporary frontend org shape until backend org APIs are wired. */
export type LocalOrganization = {
  id: string
  name: string
  slug: string
  email: string
  role: string
  createdAt: string
  phone?: string
  industry?: string
  country?: string
  timezone?: string
}

function notifyLocalOrganizationsChange() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event(LOCAL_ORGS_CHANGE_EVENT))
}

export function readLocalOrganizations(): LocalOrganization[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(LOCAL_ORGS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? (parsed as LocalOrganization[]) : []
  } catch {
    return []
  }
}

export function readLocalActiveOrganizationId(): string | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage.getItem(LOCAL_ACTIVE_ORG_KEY)
  } catch {
    return null
  }
}

function writeLocalOrganizations(orgs: LocalOrganization[]) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(LOCAL_ORGS_KEY, JSON.stringify(orgs))
  } catch {
    /* ignore */
  }
}

function writeLocalActiveOrganizationId(id: string | null) {
  if (typeof window === 'undefined') return
  try {
    if (!id) {
      window.localStorage.removeItem(LOCAL_ACTIVE_ORG_KEY)
    } else {
      window.localStorage.setItem(LOCAL_ACTIVE_ORG_KEY, id)
    }
  } catch {
    /* ignore */
  }
}

/**
 * Persists a wizard-created org in localStorage (temporary — replace with
 * POST /api/v1/organizations when auth/backend are ready).
 */
export function createLocalOrganization(input: {
  name: string
  slug: string
  email: string
  phone?: string
  industry?: string
  country?: string
  timezone?: string
}): LocalOrganization {
  const org: LocalOrganization = {
    id:
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `local-org-${Date.now()}`,
    name: input.name.trim(),
    slug: input.slug.trim(),
    email: input.email.trim(),
    phone: input.phone?.trim() || undefined,
    industry: input.industry?.trim() || undefined,
    country: input.country,
    timezone: input.timezone,
    role: 'owner',
    createdAt: new Date().toISOString(),
  }

  const next = [...readLocalOrganizations().filter((item) => item.id !== org.id), org]
  writeLocalOrganizations(next)
  writeLocalActiveOrganizationId(org.id)
  notifyLocalOrganizationsChange()
  return org
}

export function setLocalActiveOrganizationId(organizationId: string) {
  const orgs = readLocalOrganizations()
  if (!orgs.some((org) => org.id === organizationId)) return
  writeLocalActiveOrganizationId(organizationId)
  notifyLocalOrganizationsChange()
}

export function readLocalOrganizationsState(): {
  organizations: LocalOrganization[]
  activeId: string | null
} {
  const organizations = readLocalOrganizations()
  const storedActive = readLocalActiveOrganizationId()
  const activeId =
    storedActive && organizations.some((org) => org.id === storedActive)
      ? storedActive
      : (organizations[0]?.id ?? null)
  return { organizations, activeId }
}

/** Sensible defaults so org create works without extra form fields. */
export function getDefaultOrgLocaleDefaults() {
  const timezone =
    typeof Intl !== 'undefined'
      ? Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
      : 'UTC'
  return {
    country: 'IN',
    timezone,
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

export function getTimezoneOptions(): string[] {
  const defaults = getDefaultOrgLocaleDefaults()
  return Array.from(new Set([defaults.timezone, ...COMMON_TIMEZONES]))
}

/**
 * Maps wizard state → future POST /api/v1/organizations body.
 * Not sent yet — kept ready for tomorrow's API wiring.
 */
export function buildCreateOrganizationPayload(input: {
  name: string
  slug: string
  email: string
  phone: string
  industry?: string
  country: string
  timezone: string
}) {
  return {
    name: input.name.trim(),
    slug: input.slug.trim(),
    email: input.email.trim(),
    phone: input.phone.trim() || undefined,
    industry: input.industry?.trim() || undefined,
    country: input.country,
    timezone: input.timezone,
  }
}

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
