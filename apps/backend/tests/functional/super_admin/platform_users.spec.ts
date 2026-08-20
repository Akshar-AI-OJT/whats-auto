import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import { DEMO_PASSWORD, DEMO_USERS } from '#database/demo/credentials'
import { FIXTURE_IDS } from '#database/demo/fixture_ids'
import DemoSeeder from '#database/seeders/demo_seeder'
import { auth } from '#lib/auth'
import { AccessTokenClaimsService } from '#services/access_token_claims_service'

type PlatformUserOrganization = {
  memberId: string
  organizationId: string
  organizationName: string
  organizationSlug: string
  organizationStatus: boolean
  role: string
  roleId: string
}

type PlatformUser = {
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

type PaginationMeta = {
  total: number
  perPage: number
  currentPage: number
  lastPage: number
}

function unwrapList(body: unknown): { items: PlatformUser[]; meta: PaginationMeta | null } {
  if (!body || typeof body !== 'object') return { items: [], meta: null }

  const root = body as {
    data?: PlatformUser[] | { data?: PlatformUser[]; meta?: PaginationMeta }
    meta?: PaginationMeta
  }

  if (Array.isArray(root.data)) {
    return { items: root.data, meta: root.meta ?? null }
  }

  if (root.data && typeof root.data === 'object' && Array.isArray(root.data.data)) {
    return { items: root.data.data, meta: root.data.meta ?? root.meta ?? null }
  }

  return { items: [], meta: null }
}

async function mintToken(email: string, activeOrgId?: string): Promise<string> {
  const result = (await auth.api.signInEmail({
    body: { email, password: DEMO_PASSWORD },
  })) as { token?: string; user?: { id: string; name: string; email: string } }

  if (!result.token || !result.user?.id) {
    throw new Error(`Failed to sign in ${email}`)
  }

  const sessionRow = await db.from('sessions').where('token', result.token).select('id').first()
  if (!sessionRow?.id) {
    throw new Error(`No session row after sign-in for ${email}`)
  }

  if (activeOrgId) {
    await db
      .from('sessions')
      .where('id', sessionRow.id)
      .update({ activeOrganizationId: activeOrgId })
  }

  const payload = await new AccessTokenClaimsService().build({
    user: {
      id: result.user.id,
      email,
      name: result.user.name ?? email,
    },
    session: { id: sessionRow.id as string, activeOrganizationId: activeOrgId ?? null },
  })

  const signed = await auth.api.signJWT({
    body: { payload: payload as Record<string, any> },
  })
  const token = (signed as { token?: string } | null)?.token
  if (!token) {
    throw new Error(`signJWT returned no token for ${email}`)
  }
  return token
}

function errorBody(response: { body: () => unknown }): { code?: string; error?: string } {
  return response.body() as { code?: string; error?: string }
}

async function globalRoleId(name: string): Promise<string> {
  const row = await db
    .from('roles')
    .whereNull('organizationId')
    .where('name', name)
    .select('id')
    .first()
  if (!row) throw new Error(`Missing global role ${name}`)
  return row.id as string
}

test.group('Super Admin Platform Users HTTP', (group) => {
  group.setup(async () => {
    await db.from('jwks').delete()
    await new DemoSeeder(db.connection()).run()
  })

  test('superadmin can list platform users', async ({ client, assert }) => {
    const token = await mintToken(DEMO_USERS.superadmin)
    const response = await client
      .get('/api/v1/super-admin/platform-users')
      .header('Authorization', `Bearer ${token}`)

    response.assertStatus(200)
    const { items, meta } = unwrapList(response.body())
    assert.isAbove(items.length, 0)
    assert.isObject(meta)
    assert.isAbove(meta!.total, 0)
    assert.equal(meta!.currentPage, 1)
  })

  test('response includes users from multiple organizations', async ({ client, assert }) => {
    const token = await mintToken(DEMO_USERS.superadmin)
    const response = await client
      .get('/api/v1/super-admin/platform-users?perPage=100')
      .header('Authorization', `Bearer ${token}`)

    response.assertStatus(200)
    const { items } = unwrapList(response.body())
    const ids = new Set(items.map((user) => user.id))
    assert.isTrue(ids.has(FIXTURE_IDS.users.northstarOwner))
    assert.isTrue(ids.has(FIXTURE_IDS.users.harborOwner))

    const northstar = items.find((user) => user.id === FIXTURE_IDS.users.northstarOwner)
    const harbor = items.find((user) => user.id === FIXTURE_IDS.users.harborOwner)
    assert.isTrue(
      northstar?.organizations.some((org) => org.organizationId === FIXTURE_IDS.orgs.northstar)
    )
    assert.isTrue(
      harbor?.organizations.some((org) => org.organizationId === FIXTURE_IDS.orgs.harbor)
    )
  })

  test('list does not depend on the superadmin active organization', async ({ client, assert }) => {
    const withoutOrg = await mintToken(DEMO_USERS.superadmin)
    const withOrg = await mintToken(DEMO_USERS.superadmin, FIXTURE_IDS.orgs.northstar)

    const unscoped = await client
      .get('/api/v1/super-admin/platform-users?perPage=100')
      .header('Authorization', `Bearer ${withoutOrg}`)
    const scoped = await client
      .get('/api/v1/super-admin/platform-users?perPage=100')
      .header('Authorization', `Bearer ${withOrg}`)

    unscoped.assertStatus(200)
    scoped.assertStatus(200)

    const unscopedItems = unwrapList(unscoped.body()).items
    const scopedItems = unwrapList(scoped.body()).items
    assert.equal(unscopedItems.length, scopedItems.length)

    const scopedIds = new Set(scopedItems.map((user) => user.id))
    assert.isTrue(scopedIds.has(FIXTURE_IDS.users.harborOwner))
    assert.isTrue(scopedIds.has(FIXTURE_IDS.users.northstarOwner))
  })

  test('a user in two organizations appears once with both live memberships', async ({
    client,
    assert,
  }) => {
    const extraMemberId = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeee2'
    const adminRoleId = await globalRoleId('admin')

    await db.table('organization_members').insert({
      id: extraMemberId,
      organizationId: FIXTURE_IDS.orgs.harbor,
      userId: FIXTURE_IDS.users.northstarOwner,
      roleId: adminRoleId,
      permissionVersion: 1,
      isDeleted: false,
      deletedAt: null,
    })

    try {
      const token = await mintToken(DEMO_USERS.superadmin)
      const response = await client
        .get('/api/v1/super-admin/platform-users?perPage=100')
        .header('Authorization', `Bearer ${token}`)

      response.assertStatus(200)
      const { items } = unwrapList(response.body())
      const matches = items.filter((user) => user.id === FIXTURE_IDS.users.northstarOwner)
      assert.lengthOf(matches, 1)

      const orgIds = matches[0]!.organizations.map((org) => org.organizationId).sort()
      assert.deepEqual(orgIds, [FIXTURE_IDS.orgs.harbor, FIXTURE_IDS.orgs.northstar].sort())
      assert.isTrue(
        matches[0]!.organizations.some(
          (org) => org.organizationId === FIXTURE_IDS.orgs.northstar && org.role === 'owner'
        )
      )
      assert.isTrue(
        matches[0]!.organizations.some(
          (org) => org.organizationId === FIXTURE_IDS.orgs.harbor && org.role === 'admin'
        )
      )
    } finally {
      await db.from('organization_members').where('id', extraMemberId).delete()
    }
  })

  test('deleted membership is omitted while the user remains listed', async ({
    client,
    assert,
  }) => {
    await db.from('organization_members').where('id', FIXTURE_IDS.members.northstarAgent).update({
      isDeleted: true,
      deletedAt: DateTime.utc().toSQL(),
    })

    try {
      const token = await mintToken(DEMO_USERS.superadmin)
      const response = await client
        .get('/api/v1/super-admin/platform-users?perPage=100')
        .header('Authorization', `Bearer ${token}`)

      response.assertStatus(200)
      const { items } = unwrapList(response.body())
      const agent = items.find((user) => user.id === FIXTURE_IDS.users.northstarAgent)
      assert.exists(agent)
      assert.lengthOf(agent!.organizations, 0)
    } finally {
      await db.from('organization_members').where('id', FIXTURE_IDS.members.northstarAgent).update({
        isDeleted: false,
        deletedAt: null,
      })
    }
  })

  test('deleted users are excluded by default', async ({ client, assert }) => {
    await db.from('users').where('id', FIXTURE_IDS.users.northstarViewer).update({
      isActive: false,
      isDeleted: true,
      deletedAt: DateTime.utc().toSQL(),
    })

    try {
      const token = await mintToken(DEMO_USERS.superadmin)
      const response = await client
        .get('/api/v1/super-admin/platform-users?perPage=100')
        .header('Authorization', `Bearer ${token}`)

      response.assertStatus(200)
      const { items } = unwrapList(response.body())
      assert.isFalse(items.some((user) => user.id === FIXTURE_IDS.users.northstarViewer))
    } finally {
      await db.from('users').where('id', FIXTURE_IDS.users.northstarViewer).update({
        isActive: true,
        isDeleted: false,
        deletedAt: null,
      })
    }
  })

  test('active and inactive filters use isActive and still exclude deleted users', async ({
    client,
    assert,
  }) => {
    await db.from('users').where('id', FIXTURE_IDS.users.northstarSupport).update({
      isActive: false,
    })

    try {
      const token = await mintToken(DEMO_USERS.superadmin)

      const inactive = await client
        .get('/api/v1/super-admin/platform-users?status=inactive&perPage=100')
        .header('Authorization', `Bearer ${token}`)
      inactive.assertStatus(200)
      const inactiveItems = unwrapList(inactive.body()).items
      assert.isTrue(
        inactiveItems.every((user) => user.isActive === false && user.status === 'inactive')
      )
      assert.isTrue(inactiveItems.some((user) => user.id === FIXTURE_IDS.users.northstarSupport))

      const active = await client
        .get('/api/v1/super-admin/platform-users?status=active&perPage=100')
        .header('Authorization', `Bearer ${token}`)
      active.assertStatus(200)
      const activeItems = unwrapList(active.body()).items
      assert.isTrue(activeItems.every((user) => user.isActive === true && user.status === 'active'))
      assert.isFalse(activeItems.some((user) => user.id === FIXTURE_IDS.users.northstarSupport))
    } finally {
      await db.from('users').where('id', FIXTURE_IDS.users.northstarSupport).update({
        isActive: true,
      })
    }
  })

  test('search by email is case-insensitive', async ({ client, assert }) => {
    const token = await mintToken(DEMO_USERS.superadmin)
    const needle = DEMO_USERS.northstarOwner.toUpperCase()
    const response = await client
      .get(`/api/v1/super-admin/platform-users?search=${encodeURIComponent(needle)}`)
      .header('Authorization', `Bearer ${token}`)

    response.assertStatus(200)
    const { items } = unwrapList(response.body())
    assert.isTrue(items.some((user) => user.id === FIXTURE_IDS.users.northstarOwner))
    assert.isTrue(items.every((user) => user.email.toLowerCase().includes('owner.northstar')))
  })

  test('search by name is case-insensitive', async ({ client, assert }) => {
    const token = await mintToken(DEMO_USERS.superadmin)
    const response = await client
      .get(`/api/v1/super-admin/platform-users?search=${encodeURIComponent('kavya')}`)
      .header('Authorization', `Bearer ${token}`)

    response.assertStatus(200)
    const { items } = unwrapList(response.body())
    assert.isTrue(items.some((user) => user.id === FIXTURE_IDS.users.northstarAgent))
    assert.isTrue(items.every((user) => user.name.toLowerCase().includes('kavya')))
  })

  test('organizationId filter returns only live members of that organization', async ({
    client,
    assert,
  }) => {
    const token = await mintToken(DEMO_USERS.superadmin)
    const response = await client
      .get(
        `/api/v1/super-admin/platform-users?organizationId=${FIXTURE_IDS.orgs.northstar}&perPage=100`
      )
      .header('Authorization', `Bearer ${token}`)

    response.assertStatus(200)
    const { items } = unwrapList(response.body())
    assert.isAbove(items.length, 0)
    assert.isTrue(items.some((user) => user.id === FIXTURE_IDS.users.northstarOwner))
    assert.isFalse(items.some((user) => user.id === FIXTURE_IDS.users.harborOwner))
    assert.isFalse(items.some((user) => user.id === FIXTURE_IDS.users.superadmin))
    assert.isTrue(
      items.every((user) =>
        user.organizations.some((org) => org.organizationId === FIXTURE_IDS.orgs.northstar)
      )
    )
  })

  test('role filter returns only users with a live membership of that role', async ({
    client,
    assert,
  }) => {
    const token = await mintToken(DEMO_USERS.superadmin)
    const response = await client
      .get('/api/v1/super-admin/platform-users?role=owner&perPage=100')
      .header('Authorization', `Bearer ${token}`)

    response.assertStatus(200)
    const { items } = unwrapList(response.body())
    const ids = new Set(items.map((user) => user.id))
    assert.isTrue(ids.has(FIXTURE_IDS.users.northstarOwner))
    assert.isTrue(ids.has(FIXTURE_IDS.users.harborOwner))
    assert.isFalse(ids.has(FIXTURE_IDS.users.northstarAgent))
    assert.isTrue(items.every((user) => user.organizations.some((org) => org.role === 'owner')))
  })

  test('pagination returns the correct meta and page size', async ({ client, assert }) => {
    const token = await mintToken(DEMO_USERS.superadmin)
    const page1 = await client
      .get('/api/v1/super-admin/platform-users?page=1&perPage=3')
      .header('Authorization', `Bearer ${token}`)
    const page2 = await client
      .get('/api/v1/super-admin/platform-users?page=2&perPage=3')
      .header('Authorization', `Bearer ${token}`)

    page1.assertStatus(200)
    page2.assertStatus(200)

    const first = unwrapList(page1.body())
    const second = unwrapList(page2.body())
    assert.equal(first.meta?.perPage, 3)
    assert.equal(first.meta?.currentPage, 1)
    assert.equal(second.meta?.currentPage, 2)
    assert.equal(first.meta?.total, second.meta?.total)
    assert.isAtLeast(first.meta!.total, 4)
    assert.isAtLeast(first.meta!.lastPage, 2)
    assert.lengthOf(first.items, 3)
    assert.isAbove(second.items.length, 0)

    const firstIds = first.items.map((user) => user.id)
    const secondIds = second.items.map((user) => user.id)
    assert.isFalse(firstIds.some((id) => secondIds.includes(id)))
  })

  test('user with no organization returns an empty organizations array', async ({
    client,
    assert,
  }) => {
    const token = await mintToken(DEMO_USERS.superadmin)
    const response = await client
      .get('/api/v1/super-admin/platform-users?perPage=100')
      .header('Authorization', `Bearer ${token}`)

    response.assertStatus(200)
    const { items } = unwrapList(response.body())
    const superadmin = items.find((user) => user.id === FIXTURE_IDS.users.superadmin)
    assert.exists(superadmin)
    assert.deepEqual(superadmin!.organizations, [])
  })

  test('global superadmin receives platformRole=superadmin', async ({ client, assert }) => {
    const token = await mintToken(DEMO_USERS.superadmin)
    const response = await client
      .get('/api/v1/super-admin/platform-users?perPage=100')
      .header('Authorization', `Bearer ${token}`)

    response.assertStatus(200)
    const { items } = unwrapList(response.body())
    const superadmin = items.find((user) => user.id === FIXTURE_IDS.users.superadmin)
    const orgAdmin = items.find((user) => user.id === FIXTURE_IDS.users.northstarAdmin)

    assert.equal(superadmin?.platformRole, 'superadmin')
    assert.isNull(orgAdmin?.platformRole ?? null)
    assert.equal(orgAdmin?.organizations[0]?.role, 'admin')
  })

  test('normal tenant user cannot access the endpoint', async ({ client, assert }) => {
    const token = await mintToken(DEMO_USERS.northstarAgent, FIXTURE_IDS.orgs.northstar)
    const response = await client
      .get('/api/v1/super-admin/platform-users')
      .header('Authorization', `Bearer ${token}`)

    response.assertStatus(403)
    assert.equal(errorBody(response).code, 'PLATFORM_ACCESS_DENIED')
  })

  test('organization admin cannot access the endpoint', async ({ client, assert }) => {
    const token = await mintToken(DEMO_USERS.northstarAdmin, FIXTURE_IDS.orgs.northstar)
    const response = await client
      .get('/api/v1/super-admin/platform-users')
      .header('Authorization', `Bearer ${token}`)

    response.assertStatus(403)
    assert.equal(errorBody(response).code, 'PLATFORM_ACCESS_DENIED')
  })
})
