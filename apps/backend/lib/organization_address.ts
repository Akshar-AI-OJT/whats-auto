/**
 * Structured organization address stored in `organizations.address` (jsonb).
 * Country is NOT stored here — source of truth is `organizations.country`.
 */
export type OrganizationAddress = {
  addressLine1: string
  addressLine2?: string | null
  city: string
  state: string
  postalCode: string
}

export function isOrganizationAddress(value: unknown): value is OrganizationAddress {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const row = value as Record<string, unknown>
  return typeof row.addressLine1 === 'string'
}

/**
 * Normalize API input (legacy free-text string or structured object) to jsonb shape.
 * Strips any legacy `country` property from objects — country lives on organizations.country.
 */
export function normalizeOrganizationAddress(
  value: string | OrganizationAddress | (OrganizationAddress & { country?: string }),
  _fallbackCountry?: string | null
): OrganizationAddress {
  if (typeof value === 'string') {
    const line = value.trim()
    return {
      addressLine1: line,
      addressLine2: null,
      city: '',
      state: '',
      postalCode: '',
    }
  }

  return {
    addressLine1: value.addressLine1.trim(),
    addressLine2: value.addressLine2?.trim() ? value.addressLine2.trim() : null,
    city: value.city.trim(),
    state: value.state.trim(),
    postalCode: value.postalCode.trim(),
  }
}

/** Parse a DB jsonb/text value into the public address object (or null). */
export function parseOrganizationAddress(value: unknown): OrganizationAddress | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return null
    if (trimmed.startsWith('{')) {
      try {
        return parseOrganizationAddress(JSON.parse(trimmed))
      } catch {
        return {
          addressLine1: trimmed,
          addressLine2: null,
          city: '',
          state: '',
          postalCode: '',
        }
      }
    }
    return {
      addressLine1: trimmed,
      addressLine2: null,
      city: '',
      state: '',
      postalCode: '',
    }
  }

  if (!isOrganizationAddress(value)) return null

  const row = value as Record<string, unknown>
  return {
    addressLine1: String(row.addressLine1 ?? ''),
    addressLine2:
      typeof row.addressLine2 === 'string' && row.addressLine2.trim()
        ? row.addressLine2.trim()
        : null,
    city: typeof row.city === 'string' ? row.city : '',
    state: typeof row.state === 'string' ? row.state : '',
    postalCode: typeof row.postalCode === 'string' ? row.postalCode : '',
  }
}

/**
 * Flatten structured address for invoice / legacy string consumers.
 * Pass `country` separately when available (organizations.country).
 */
export function formatOrganizationAddress(value: unknown, country?: string | null): string | null {
  const parsed = parseOrganizationAddress(value)
  if (!parsed) return null

  const parts = [
    parsed.addressLine1,
    parsed.addressLine2,
    parsed.city,
    parsed.state,
    parsed.postalCode,
    typeof country === 'string' ? country.trim() : '',
  ]
    .map((part) => (typeof part === 'string' ? part.trim() : ''))
    .filter(Boolean)

  return parts.length > 0 ? parts.join(', ') : null
}
