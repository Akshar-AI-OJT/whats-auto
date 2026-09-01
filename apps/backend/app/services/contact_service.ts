import db from '@adonisjs/lucid/services/db'
import ContactException from '#exceptions/contact_exception'
import { normalizeContactPhone } from '#lib/contact_phone'
import { PlanEnforcementService } from '#services/billing/plan_enforcement_service'

export { normalizeContactPhone }

/** Postgres unique_violation, including Knex/Lucid-wrapped errors. */
function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error
  for (let depth = 0; depth < 4 && current && typeof current === 'object'; depth++) {
    const code = (current as { code?: string }).code
    if (code === '23505') return true
    current = (current as { cause?: unknown }).cause ?? (current as { original?: unknown }).original
  }
  return false
}

export type ContactRecord = {
  id: string
  organizationId: string
  phone: string
  phoneNormalized: string
  name: string | null
  email: string | null
  company: string | null
  customFields: Record<string, unknown>
  createdByUserId: string | null
  createdAt: string
  updatedAt: string | null
}

function mapContactRow(r: Record<string, unknown>): ContactRecord {
  const customFields =
    r.customFields && typeof r.customFields === 'object' && !Array.isArray(r.customFields)
      ? (r.customFields as Record<string, unknown>)
      : {}

  return {
    id: r.id as string,
    organizationId: r.organizationId as string,
    phone: r.phone as string,
    phoneNormalized: r.phoneNormalized as string,
    name: (r.name as string | null) ?? null,
    email: (r.email as string | null) ?? null,
    company: (r.company as string | null) ?? null,
    customFields,
    createdByUserId: (r.createdByUserId as string | null) ?? null,
    createdAt: r.createdAt as string,
    updatedAt: (r.updatedAt as string | null) ?? null,
  }
}

const CONTACT_COLUMNS = [
  'id',
  'organizationId',
  'phone',
  'phoneNormalized',
  'name',
  'email',
  'company',
  'customFields',
  'createdByUserId',
  'createdAt',
  'updatedAt',
] as const

export class ContactService {
  /**
   * List non-deleted contacts for one organization.
   * Filters by organizationId in app code (defense in depth) + RLS.
   */
  async listContacts(organizationId: string) {
    const rows = await db
      .from('contacts')
      .where('organizationId', organizationId)
      .whereNull('deletedAt')
      .select(...CONTACT_COLUMNS)
      .orderBy('createdAt', 'desc')

    return rows.map((r) => mapContactRow(r))
  }

  /**
   * Create a contact for the active tenant.
   * Unique on (organizationId, phoneNormalized) where deletedAt IS NULL.
   */
  async createContact(params: {
    organizationId: string
    actorUserId: string
    phoneNumber: string
    countryCode?: string
    name?: string
    email?: string
    company?: string
  }) {
    const { organizationId, actorUserId, phoneNumber, countryCode } = params
    const phoneNormalized = normalizeContactPhone(phoneNumber, countryCode)
    const name = params.name?.trim() || null
    const email = params.email?.trim().toLowerCase() || null
    const company = params.company?.trim() || null

    const countRow = await db
      .from('contacts')
      .where('organizationId', organizationId)
      .whereNull('deletedAt')
      .count('* as total')
      .first()
    await new PlanEnforcementService().requireUnderLimit(
      organizationId,
      'maxContacts',
      Number(countRow?.total ?? 0)
    )

    try {
      const [row] = await db
        .table('contacts')
        .insert({
          organizationId,
          phone: phoneNumber.trim(),
          phoneNormalized,
          name,
          email,
          company,
          customFields: {},
          createdByUserId: actorUserId,
        })
        .returning([...CONTACT_COLUMNS])

      return mapContactRow(row)
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw ContactException.duplicatePhone()
      }
      throw error
    }
  }

  /**
   * Soft-delete a contact without removing the row.
   * History (inbox, campaigns) stays intact; the phone can be reused.
   */
  async softDeleteContact(params: {
    contactId: string
    organizationId: string
  }): Promise<{ ok: true }> {
    const row = await db
      .from('contacts')
      .where('id', params.contactId)
      .where('organizationId', params.organizationId)
      .select('id', 'deletedAt')
      .first()

    if (!row) {
      throw ContactException.notFound()
    }

    if (row.deletedAt) {
      throw ContactException.alreadyDeleted()
    }

    const updated = await db
      .from('contacts')
      .where('id', params.contactId)
      .where('organizationId', params.organizationId)
      .whereNull('deletedAt')
      .update({ deletedAt: new Date() })

    if (!updated) {
      throw ContactException.notFound()
    }

    return { ok: true }
  }
}
