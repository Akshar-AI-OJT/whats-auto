const ORGANIZATION_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const CONTACT_IMPORTS_FOLDER = 'imports/contacts'

function assertOrganizationId(organizationId: string): string {
  if (!ORGANIZATION_ID_RE.test(organizationId)) {
    throw new Error('Invalid organization id for storage path')
  }
  return organizationId
}

/**
 * Organization-scoped object key prefix. The id must come from tenant context,
 * never from a client-supplied path.
 */
export function organizationStoragePrefix(organizationId: string): string {
  return `organizations/${assertOrganizationId(organizationId)}`
}

export function contactImportStoragePrefix(organizationId: string): string {
  return `${organizationStoragePrefix(organizationId)}/${CONTACT_IMPORTS_FOLDER}`
}

/**
 * Safe CSV filename for contact imports. Strips directories, rejects
 * traversal, and always ends with `.csv`.
 */
export function sanitizeContactImportFileName(original: string): string {
  const base = original.replace(/\\/g, '/').split('/').pop() ?? ''
  const cleaned = base.replace(/\0/g, '').trim()
  const lastDot = cleaned.lastIndexOf('.')
  const stemRaw = lastDot > 0 ? cleaned.slice(0, lastDot) : cleaned.replace(/\.csv$/i, '')
  const stem = stemRaw
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/^\.+/, '')
    .replace(/\.+$/, '')
    .slice(0, 180)

  if (!stem || stem === '.' || stem === '..') {
    return 'contacts.csv'
  }

  return `${stem}.csv`
}

export function buildContactImportStorageKey(
  organizationId: string,
  originalFileName: string
): string {
  return `${contactImportStoragePrefix(organizationId)}/${sanitizeContactImportFileName(originalFileName)}`
}

export function uniqueContactImportStorageKey(
  organizationId: string,
  originalFileName: string,
  uniqueSuffix: string
): string {
  const sanitized = sanitizeContactImportFileName(originalFileName)
  const stem = sanitized.replace(/\.csv$/i, '')
  const suffix = uniqueSuffix.replace(/[^A-Za-z0-9._-]+/g, '_')
  return buildContactImportStorageKey(organizationId, `${stem}-${suffix}.csv`)
}

/**
 * Ensure a stored key stays under this organization's contact-import folder
 * and does not traverse into another tenant or sibling folder.
 */
export function assertContactImportStorageKey(
  organizationId: string,
  key: string
): string {
  if (typeof key !== 'string' || !key) {
    throw new Error('Contact import file path is missing')
  }

  const normalized = key.replace(/\\/g, '/')
  if (normalized !== key || normalized.includes('..') || normalized.startsWith('/')) {
    throw new Error('Contact import file path is invalid')
  }

  const prefix = `${contactImportStoragePrefix(organizationId)}/`
  if (!normalized.startsWith(prefix)) {
    throw new Error('Contact import file is outside the organization storage path')
  }

  const rest = normalized.slice(prefix.length)
  if (!rest || rest.includes('/') || rest === '.' || rest === '..') {
    throw new Error('Contact import file is outside the organization storage path')
  }

  return normalized
}
