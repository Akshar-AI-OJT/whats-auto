import db from '@adonisjs/lucid/services/db'

export type PlatformUserStatusFilter = 'active' | 'inactive' | 'all'

export type ListPlatformUsersParams = {
  page: number
  perPage: number
  search?: string
  status?: PlatformUserStatusFilter
  organizationId?: string
  role?: string
}

export type PlatformUserOrganization = {
  memberId: string
  organizationId: string
  organizationName: string
  organizationSlug: string
  organizationStatus: boolean
  role: string
  roleId: string
}

export type PlatformUserRecord = {
  id: string
  name: string
  firstname: string
  lastname: string
  email: string
  isActive: boolean
  status: 'active' | 'inactive'
  emailVerified: boolean
  createdAt: string
  updatedAt: string | null
  platformRole: 'superadmin' | null
  organizations: PlatformUserOrganization[]
}

type UserRow = {
  id: string
  name: string
  firstname: string
  lastname: string
  email: string
  isActive: boolean
  isDeleted: boolean
  emailVerified: boolean
  createdAt: Date | string
  updatedAt: Date | string | null
}

type MembershipRow = {
  memberId: string
  userId: string
  organizationId: string
  organizationName: string
  organizationSlug: string
  organizationStatus: boolean
  role: string
  roleId: string
}

function toIso(value: Date | string | null | undefined): string | null {
  if (value === null || value === undefined) return null
  if (value instanceof Date) return value.toISOString()
  return new Date(value).toISOString()
}

function derivedStatus(isActive: boolean, isDeleted: boolean): 'active' | 'inactive' {
  if (isDeleted) return 'inactive'
  return isActive ? 'active' : 'inactive'
}

function escapeIlike(value: string): string {
  return `%${value.replace(/[%_\\]/g, '\\$&')}%`
}

export class SuperAdminPlatformUsersService {
  /**
   * Platform-wide paginated user list. Paginates users, then attaches live
   * memberships. Does not use the active organization.
   */
  async listPlatformUsersPaginated(params: ListPlatformUsersParams) {
    const page = params.page
    const perPage = params.perPage

    const query = db.from('users as u').where('u.isDeleted', false)

    if (params.status === 'active') {
      query.where('u.isActive', true)
    } else if (params.status === 'inactive') {
      query.where('u.isActive', false)
    }

    const search = params.search?.trim()
    if (search) {
      const pattern = escapeIlike(search)
      query.where((builder) => {
        builder.whereILike('u.name', pattern).orWhereILike('u.email', pattern)
      })
    }

    if (params.organizationId || params.role) {
      query.whereExists((sub) => {
        sub.from('organization_members as m')
        if (params.role) {
          sub.innerJoin('roles as r', 'r.id', 'm.roleId').where('r.name', params.role)
        }
        sub.whereColumn('m.userId', 'u.id').where('m.isDeleted', false)
        if (params.organizationId) {
          sub.where('m.organizationId', params.organizationId)
        }
        sub.select('m.id')
      })
    }

    const paginator = await query
      .select(
        'u.id',
        'u.name',
        'u.firstname',
        'u.lastname',
        'u.email',
        'u.isActive',
        'u.isDeleted',
        'u.emailVerified',
        'u.createdAt',
        'u.updatedAt'
      )
      .orderBy('u.createdAt', 'desc')
      .orderBy('u.id', 'desc')
      .paginate(page, perPage)

    const userRows = paginator.all() as UserRow[]
    const userIds = userRows.map((row) => row.id)

    const organizationsByUser = await this.#loadLiveMemberships(userIds)
    const platformRoleByUser = await this.#loadPlatformRoles(userIds)

    const data: PlatformUserRecord[] = userRows.map((row) => {
      const isActive = Boolean(row.isActive)
      const isDeleted = Boolean(row.isDeleted)
      return {
        id: row.id,
        name: row.name,
        firstname: row.firstname,
        lastname: row.lastname,
        email: row.email,
        isActive,
        status: derivedStatus(isActive, isDeleted),
        emailVerified: Boolean(row.emailVerified),
        createdAt: toIso(row.createdAt) as string,
        updatedAt: toIso(row.updatedAt),
        platformRole: platformRoleByUser.get(row.id) ?? null,
        organizations: organizationsByUser.get(row.id) ?? [],
      }
    })

    // Return a DTO envelope. Lucid SimplePaginator keeps original query rows in
    // a private `rows` snapshot used by all()/toJSON(); splicing the array does
    // not update that snapshot, so serialize() would drop computed fields.
    return {
      data,
      meta: paginator.getMeta(),
    }
  }

  async #loadLiveMemberships(userIds: string[]): Promise<Map<string, PlatformUserOrganization[]>> {
    const byUser = new Map<string, PlatformUserOrganization[]>()
    if (userIds.length === 0) return byUser

    const rows = (await db
      .from('organization_members as m')
      .innerJoin('organizations as o', 'o.id', 'm.organizationId')
      .innerJoin('roles as r', 'r.id', 'm.roleId')
      .whereIn('m.userId', userIds)
      .where('m.isDeleted', false)
      .select(
        'm.id as memberId',
        'm.userId',
        'm.organizationId',
        'o.name as organizationName',
        'o.slug as organizationSlug',
        'o.status as organizationStatus',
        'r.name as role',
        'm.roleId'
      )
      .orderBy('o.name', 'asc')
      .orderBy('m.id', 'asc')) as MembershipRow[]

    for (const row of rows) {
      const memberships = byUser.get(row.userId) ?? []
      memberships.push({
        memberId: row.memberId,
        organizationId: row.organizationId,
        organizationName: row.organizationName,
        organizationSlug: row.organizationSlug,
        organizationStatus: Boolean(row.organizationStatus),
        role: row.role,
        roleId: row.roleId,
      })
      byUser.set(row.userId, memberships)
    }

    return byUser
  }

  async #loadPlatformRoles(userIds: string[]): Promise<Map<string, 'superadmin'>> {
    const byUser = new Map<string, 'superadmin'>()
    if (userIds.length === 0) return byUser

    const rows = await db
      .from('user_roles as ur')
      .innerJoin('roles as r', 'r.id', 'ur.roleId')
      .whereIn('ur.userId', userIds)
      .whereNull('ur.organizationId')
      .where('r.name', 'superadmin')
      .select('ur.userId')

    for (const row of rows) {
      byUser.set(row.userId as string, 'superadmin')
    }

    return byUser
  }
}
