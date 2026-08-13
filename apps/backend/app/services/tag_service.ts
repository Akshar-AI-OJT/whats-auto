import db from '@adonisjs/lucid/services/db'
import TagException from '#exceptions/tag_exception'

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

export type TagRecord = {
  id: string
  organizationId: string
  createdByUserId: string | null
  name: string
  color: string | null
  createdAt: string
  contactCount: number
}

export type TagAssignmentRecord = {
  id: string
  organizationId: string
  tagId: string
  contactId: string
}

export type TagContactRecord = {
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

const TAG_COLUMNS = [
  'tags.id',
  'tags.organizationId',
  'tags.createdByUserId',
  'tags.name',
  'tags.color',
  'tags.createdAt',
] as const

const CONTACT_COLUMNS = [
  'c.id',
  'c.organizationId',
  'c.phone',
  'c.phoneNormalized',
  'c.name',
  'c.email',
  'c.company',
  'c.customFields',
  'c.createdByUserId',
  'c.createdAt',
  'c.updatedAt',
] as const

/** Live (non-deleted) contacts assigned to the tag. */
const CONTACT_COUNT_SQL = `(
  SELECT COUNT(*)::int
  FROM contact_tags AS ct
  INNER JOIN contacts AS c ON c.id = ct."contactId"
  WHERE ct."tagId" = tags.id
    AND ct."organizationId" = tags."organizationId"
    AND c."deletedAt" IS NULL
) AS "contactCount"`

function mapTagRow(r: Record<string, unknown>): TagRecord {
  return {
    id: r.id as string,
    organizationId: r.organizationId as string,
    createdByUserId: (r.createdByUserId as string | null) ?? null,
    name: r.name as string,
    color: (r.color as string | null) ?? null,
    createdAt: r.createdAt as string,
    contactCount: Number(r.contactCount ?? 0),
  }
}

function mapAssignmentRow(r: Record<string, unknown>): TagAssignmentRecord {
  return {
    id: r.id as string,
    organizationId: r.organizationId as string,
    tagId: r.tagId as string,
    contactId: r.contactId as string,
  }
}

function mapContactRow(r: Record<string, unknown>): TagContactRecord {
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

function normalizeColor(color: string | null | undefined): string | null {
  if (color === undefined || color === null) return null
  return color.trim() || null
}

export class TagService {
  /**
   * List tags for one organization. Filters by organizationId (defense in depth) + RLS.
   */
  async listTags(organizationId: string): Promise<TagRecord[]> {
    const rows = await db
      .from('tags')
      .where('organizationId', organizationId)
      .select(...TAG_COLUMNS, db.raw(CONTACT_COUNT_SQL))
      .orderBy('createdAt', 'desc')

    return rows.map((r) => mapTagRow(r))
  }

  async getTagById(params: { organizationId: string; tagId: string }): Promise<TagRecord> {
    return this.#getTagOrFail(params.organizationId, params.tagId)
  }

  async createTag(params: {
    organizationId: string
    actorUserId: string
    name: string
    color?: string | null
  }): Promise<TagRecord> {
    const name = params.name.trim()
    const color = normalizeColor(params.color)

    try {
      const [row] = await db
        .table('tags')
        .insert({
          organizationId: params.organizationId,
          createdByUserId: params.actorUserId,
          name,
          color,
        })
        .returning(['id', 'organizationId', 'createdByUserId', 'name', 'color', 'createdAt'])

      return mapTagRow({ ...row, contactCount: 0 })
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw TagException.duplicateName()
      }
      throw error
    }
  }

  async updateTag(params: {
    organizationId: string
    tagId: string
    name?: string
    color?: string | null
  }): Promise<TagRecord> {
    if (params.name === undefined && params.color === undefined) {
      throw TagException.emptyUpdate()
    }

    await this.#getTagOrFail(params.organizationId, params.tagId)

    const patch: Record<string, unknown> = {}
    if (params.name !== undefined) {
      patch.name = params.name.trim()
    }
    if (params.color !== undefined) {
      patch.color = normalizeColor(params.color)
    }

    try {
      await db
        .from('tags')
        .where('id', params.tagId)
        .where('organizationId', params.organizationId)
        .update(patch)
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw TagException.duplicateName()
      }
      throw error
    }

    return this.#getTagOrFail(params.organizationId, params.tagId)
  }

  /**
   * Hard-delete a tag. `contact_tags` rows cascade via the existing FK.
   * Contacts are not deleted.
   */
  async deleteTag(params: { organizationId: string; tagId: string }): Promise<{ ok: true }> {
    await this.#getTagOrFail(params.organizationId, params.tagId)

    await db
      .from('tags')
      .where('id', params.tagId)
      .where('organizationId', params.organizationId)
      .delete()

    return { ok: true }
  }

  async listTagContacts(params: {
    organizationId: string
    tagId: string
  }): Promise<TagContactRecord[]> {
    await this.#getTagOrFail(params.organizationId, params.tagId)

    const rows = await db
      .from('contacts as c')
      .innerJoin('contact_tags as ct', 'ct.contactId', 'c.id')
      .where('ct.tagId', params.tagId)
      .where('ct.organizationId', params.organizationId)
      .where('c.organizationId', params.organizationId)
      .whereNull('c.deletedAt')
      .select(...CONTACT_COLUMNS)
      .orderBy('c.createdAt', 'desc')

    return rows.map((r) => mapContactRow(r))
  }

  async assignContact(params: {
    organizationId: string
    tagId: string
    contactId: string
  }): Promise<TagAssignmentRecord> {
    await this.#getTagOrFail(params.organizationId, params.tagId)
    await this.#assertLiveContact(params.organizationId, params.contactId)

    try {
      const [row] = await db
        .table('contact_tags')
        .insert({
          organizationId: params.organizationId,
          tagId: params.tagId,
          contactId: params.contactId,
        })
        .returning(['id', 'organizationId', 'tagId', 'contactId'])

      return mapAssignmentRow(row)
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw TagException.duplicateAssignment()
      }
      throw error
    }
  }

  async removeContact(params: {
    organizationId: string
    tagId: string
    contactId: string
  }): Promise<{ ok: true }> {
    await this.#getTagOrFail(params.organizationId, params.tagId)

    const deleted = await db
      .from('contact_tags')
      .where('organizationId', params.organizationId)
      .where('tagId', params.tagId)
      .where('contactId', params.contactId)
      .delete()

    if (Number(deleted) === 0) {
      throw TagException.assignmentNotFound()
    }

    return { ok: true }
  }

  async #getTagOrFail(organizationId: string, tagId: string): Promise<TagRecord> {
    const row = await db
      .from('tags')
      .where('id', tagId)
      .where('organizationId', organizationId)
      .select(...TAG_COLUMNS, db.raw(CONTACT_COUNT_SQL))
      .first()

    if (!row) {
      throw TagException.notFound()
    }

    return mapTagRow(row)
  }

  async #assertLiveContact(organizationId: string, contactId: string): Promise<void> {
    const contact = await db
      .from('contacts')
      .where('id', contactId)
      .where('organizationId', organizationId)
      .whereNull('deletedAt')
      .select('id')
      .first()

    if (!contact) {
      throw TagException.invalidContact()
    }
  }
}
