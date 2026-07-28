import { randomBytes } from 'node:crypto'
import db from '@adonisjs/lucid/services/db'
import TenantException from '#exceptions/tenant_exception'
import { OrganizationService } from '#services/organization_service'

export type TenantRecord = {
  id: string
  name: string
  slug: string
  logo: string | null
  metadata: unknown
  createdAt: Date
  role?: string
}

function slugifyTenantName(name: string): string {
  const slug = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug || 'tenant'
}

function parseMetadata(value: unknown): string | null {
  if (value === undefined || value === null) return null
  if (typeof value === 'string') return value
  return JSON.stringify(value)
}

function decodeMetadata(value: string | null): unknown {
  if (value === null || value === '') return null
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

function mapTenantRow(row: {
  id: string
  name: string
  slug: string
  logo: string | null
  metadata: string | null
  createdAt: Date
  role?: string
}): TenantRecord {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    logo: row.logo,
    metadata: decodeMetadata(row.metadata),
    createdAt: row.createdAt,
    ...(row.role !== undefined ? { role: row.role } : {}),
  }
}

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

/**
 * Tenant use-cases over the existing `organizations` table.
 * Tenant === Organization in this architecture.
 */
export class TenantService {
  /**
   * Create a tenant and make the actor the owner. Seeds default dynamic roles.
   */
  async create(params: {
    actorUserId: string
    name: string
    slug?: string
    logo?: string
    metadata?: unknown
  }): Promise<TenantRecord> {
    const { actorUserId, name, logo, metadata } = params
    let slug = params.slug?.trim().toLowerCase() || slugifyTenantName(name)

    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      throw TenantException.invalidSlug(slug)
    }

    const orgService = new OrganizationService()

    try {
      return await db.transaction(async (trx) => {
        const existing = await trx.from('organizations').where('slug', slug).select('id').first()
        if (existing) {
          if (params.slug) {
            throw TenantException.slugTaken(slug)
          }
          slug = `${slug}-${randomBytes(3).toString('hex')}`
        }

        const [org] = await trx
          .table('organizations')
          .insert({
            name,
            slug,
            logo: logo ?? null,
            metadata: parseMetadata(metadata),
          })
          .returning(['id', 'name', 'slug', 'logo', 'metadata', 'createdAt'])

        await trx.table('organization_members').insert({
          organizationId: org.id,
          userId: actorUserId,
          role: 'owner',
        })

        await orgService.seedDefaultRoles(org.id, trx)

        await trx.table('authorization_audits').insert({
          organizationId: org.id,
          actorUserId,
          targetType: 'organization',
          targetId: org.id,
          eventType: 'tenant.created',
          before: null,
          after: JSON.stringify({ name, slug }),
          reason: null,
        })

        return mapTenantRow({ ...org, role: 'owner' })
      })
    } catch (error) {
      if (error instanceof TenantException) throw error
      if (isUniqueViolation(error)) {
        throw TenantException.slugTaken(slug)
      }
      throw error
    }
  }

  /**
   * List tenants the user belongs to (includes membership role).
   */
  async listForUser(userId: string): Promise<TenantRecord[]> {
    const rows = await db
      .from('organizations as o')
      .innerJoin('organization_members as m', 'm.organizationId', 'o.id')
      .where('m.userId', userId)
      .select('o.id', 'o.name', 'o.slug', 'o.logo', 'o.metadata', 'o.createdAt', 'm.role')
      .orderBy('o.createdAt', 'desc')

    return rows.map((row) => mapTenantRow(row))
  }

  /**
   * Get a tenant by id if the user is a member.
   */
  async findForMember(organizationId: string, userId: string): Promise<TenantRecord> {
    const row = await db
      .from('organizations as o')
      .innerJoin('organization_members as m', 'm.organizationId', 'o.id')
      .where('o.id', organizationId)
      .where('m.userId', userId)
      .select('o.id', 'o.name', 'o.slug', 'o.logo', 'o.metadata', 'o.createdAt', 'm.role')
      .first()

    if (!row) {
      const exists = await db.from('organizations').where('id', organizationId).select('id').first()
      if (!exists) throw TenantException.notFound()
      throw TenantException.notAMember()
    }

    return mapTenantRow(row)
  }

  /**
   * Update tenant profile. Owner only.
   */
  async update(params: {
    organizationId: string
    actorUserId: string
    name?: string
    slug?: string
    logo?: string | null
    metadata?: unknown
  }): Promise<TenantRecord> {
    const { organizationId, actorUserId } = params
    await this.assertOwner(organizationId, actorUserId)

    const patch: Record<string, unknown> = {}
    if (params.name !== undefined) patch.name = params.name
    if (params.logo !== undefined) patch.logo = params.logo
    if (params.metadata !== undefined) patch.metadata = parseMetadata(params.metadata)

    if (params.slug !== undefined) {
      const slug = params.slug.trim().toLowerCase()
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
        throw TenantException.invalidSlug(slug)
      }
      const taken = await db
        .from('organizations')
        .where('slug', slug)
        .whereNot('id', organizationId)
        .select('id')
        .first()
      if (taken) throw TenantException.slugTaken(slug)
      patch.slug = slug
    }

    if (Object.keys(patch).length === 0) {
      return this.findForMember(organizationId, actorUserId)
    }

    try {
      await db.transaction(async (trx) => {
        const before = await trx
          .from('organizations')
          .where('id', organizationId)
          .select('name', 'slug', 'logo', 'metadata')
          .firstOrFail()

        await trx.from('organizations').where('id', organizationId).update(patch)

        await trx.table('authorization_audits').insert({
          organizationId,
          actorUserId,
          targetType: 'organization',
          targetId: organizationId,
          eventType: 'tenant.updated',
          before: JSON.stringify(before),
          after: JSON.stringify({ ...before, ...patch }),
          reason: null,
        })
      })
    } catch (error) {
      if (error instanceof TenantException) throw error
      if (isUniqueViolation(error)) {
        throw TenantException.slugTaken(String(params.slug ?? ''))
      }
      throw error
    }

    return this.findForMember(organizationId, actorUserId)
  }

  /**
   * Delete a tenant. Owner only. Cascades members/roles/invites via FKs.
   */
  async delete(organizationId: string, actorUserId: string): Promise<void> {
    await this.assertOwner(organizationId, actorUserId)
    // Audits cascade with the org row — no durable delete audit without a separate store.
    await db.from('organizations').where('id', organizationId).delete()
  }

  private async assertOwner(organizationId: string, userId: string): Promise<void> {
    const exists = await db.from('organizations').where('id', organizationId).select('id').first()
    if (!exists) throw TenantException.notFound()

    const member = await db
      .from('organization_members')
      .where('organizationId', organizationId)
      .where('userId', userId)
      .select('role')
      .first()

    if (!member) throw TenantException.notAMember()
    if (member.role !== 'owner') throw TenantException.notOwner()
  }
}
