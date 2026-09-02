import { randomUUID } from 'node:crypto'
import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { DEMO_PASSWORD, DEMO_USERS } from '#database/demo/credentials'
import { FIXTURE_IDS } from '#database/demo/fixture_ids'
import DemoSeeder from '#database/seeders/demo_seeder'
import { auth } from '#lib/auth'
import { AccessTokenClaimsService } from '#services/access_token_claims_service'
import { NotificationService, type NotificationRecord } from '#services/notification_service'

const ACTIVE_ORG_BY_EMAIL: Record<string, string> = {
  [DEMO_USERS.northstarOwner]: FIXTURE_IDS.orgs.northstar,
  [DEMO_USERS.northstarAdmin]: FIXTURE_IDS.orgs.northstar,
  [DEMO_USERS.northstarAgent]: FIXTURE_IDS.orgs.northstar,
  [DEMO_USERS.harborOwner]: FIXTURE_IDS.orgs.harbor,
}

type PaginationMeta = {
  total: number
  perPage: number
  currentPage: number
  lastPage: number
}

function errorBody(response: { body: () => unknown }): { code?: string; error?: string } {
  return response.body() as { code?: string; error?: string }
}

function unwrapList(body: unknown): { items: NotificationRecord[]; meta: PaginationMeta | null } {
  if (!body || typeof body !== 'object') return { items: [], meta: null }

  const root = body as {
    data?: NotificationRecord[] | { data?: NotificationRecord[]; meta?: PaginationMeta }
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

function unwrapNotification(body: unknown): NotificationRecord | null {
  if (!body || typeof body !== 'object') return null
  const root = body as { data?: NotificationRecord } & Partial<NotificationRecord>
  if (root.data && typeof root.data === 'object' && 'id' in root.data) {
    return root.data
  }
  if ('id' in root && typeof root.id === 'string') {
    return root as NotificationRecord
  }
  return null
}

async function mintDemoToken(email: string, activeOrgId?: string): Promise<string> {
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

  const orgId = activeOrgId ?? ACTIVE_ORG_BY_EMAIL[email]
  if (orgId) {
    await db.from('sessions').where('id', sessionRow.id).update({ activeOrganizationId: orgId })
  }

  const payload = await new AccessTokenClaimsService().build({
    user: {
      id: result.user.id,
      email,
      name: result.user.name ?? email,
    },
    session: { id: sessionRow.id as string, activeOrganizationId: orgId ?? null },
  })

  const signed = await auth.api.signJWT({
    body: { payload: payload as Record<string, unknown> },
  })
  const token = (signed as { token?: string } | null)?.token
  if (!token) {
    throw new Error(`signJWT returned no token for ${email}`)
  }
  return token
}

async function seedNotification(params: {
  organizationId: string
  userId: string
  type?: string
  title?: string
  body?: string | null
  readAt?: Date | null
}): Promise<NotificationRecord> {
  const created = await new NotificationService().createNotification({
    organizationId: params.organizationId,
    userId: params.userId,
    type: params.type ?? 'test_notification',
    title: params.title ?? 'Test notification',
    body: params.body ?? 'Test body',
  })

  if (params.readAt) {
    await db.from('notifications').where('id', created.id).update({ readAt: params.readAt })
    return { ...created, readAt: params.readAt.toISOString() }
  }

  return created
}

test.group('Notifications HTTP', (group) => {
  const createdIds: string[] = []

  group.setup(async () => {
    await db.from('jwks').delete()
    await new DemoSeeder(db.connection()).run()
  })

  group.each.teardown(async () => {
    while (createdIds.length > 0) {
      const id = createdIds.pop()
      if (id) {
        await db.from('notifications').where('id', id).delete()
      }
    }
  })

  test('rejects unauthenticated list', async ({ client }) => {
    const response = await client.get('/api/v1/notifications')
    response.assertStatus(401)
  })

  test('rejects unauthenticated mark as read', async ({ client }) => {
    const response = await client.patch(`/api/v1/notifications/${randomUUID()}/read`)
    response.assertStatus(401)
  })

  test('rejects unauthenticated mark all as read', async ({ client }) => {
    const response = await client.patch('/api/v1/notifications/read-all')
    response.assertStatus(401)
  })

  test('rejects platform token with no active organization', async ({ client, assert }) => {
    const token = await mintDemoToken(DEMO_USERS.superadmin)
    const response = await client
      .get('/api/v1/notifications')
      .header('Authorization', `Bearer ${token}`)

    response.assertStatus(403)
    assert.equal(errorBody(response).code, 'NO_ACTIVE_ORG')
  })

  test('empty list returns data array and pagination meta', async ({ client, assert }) => {
    const token = await mintDemoToken(DEMO_USERS.northstarOwner)
    await db.from('notifications').where('userId', FIXTURE_IDS.users.northstarOwner).delete()

    const response = await client
      .get('/api/v1/notifications')
      .header('Authorization', `Bearer ${token}`)

    response.assertStatus(200)
    const { items, meta } = unwrapList(response.body())
    assert.isArray(items)
    assert.lengthOf(items, 0)
    assert.exists(meta)
    assert.equal(meta!.total, 0)
    assert.equal(meta!.currentPage, 1)
    assert.equal(meta!.lastPage, 1)
  })

  test('lists only the authenticated user notifications in the active org', async ({
    client,
    assert,
  }) => {
    const own = await seedNotification({
      organizationId: FIXTURE_IDS.orgs.northstar,
      userId: FIXTURE_IDS.users.northstarOwner,
      title: 'Owner notice',
    })
    createdIds.push(own.id)

    const teammate = await seedNotification({
      organizationId: FIXTURE_IDS.orgs.northstar,
      userId: FIXTURE_IDS.users.northstarAdmin,
      title: 'Admin notice',
    })
    createdIds.push(teammate.id)

    const otherOrg = await seedNotification({
      organizationId: FIXTURE_IDS.orgs.harbor,
      userId: FIXTURE_IDS.users.harborOwner,
      title: 'Harbor notice',
    })
    createdIds.push(otherOrg.id)

    const token = await mintDemoToken(DEMO_USERS.northstarOwner)
    const response = await client
      .get('/api/v1/notifications')
      .header('Authorization', `Bearer ${token}`)

    response.assertStatus(200)
    const { items } = unwrapList(response.body())
    const ids = items.map((item) => item.id)
    assert.include(ids, own.id)
    assert.notInclude(ids, teammate.id)
    assert.notInclude(ids, otherOrg.id)
    assert.isTrue(items.every((item) => item.organizationId === FIXTURE_IDS.orgs.northstar))
    assert.isTrue(items.every((item) => item.userId === FIXTURE_IDS.users.northstarOwner))
  })

  test('pagination returns the requested page and meta', async ({ client, assert }) => {
    const ids: string[] = []
    for (let i = 0; i < 3; i++) {
      const row = await seedNotification({
        organizationId: FIXTURE_IDS.orgs.northstar,
        userId: FIXTURE_IDS.users.northstarOwner,
        title: `Page item ${i}`,
      })
      ids.push(row.id)
      createdIds.push(row.id)
    }

    const token = await mintDemoToken(DEMO_USERS.northstarOwner)
    const page1 = await client
      .get('/api/v1/notifications')
      .qs({ page: 1, limit: 2 })
      .header('Authorization', `Bearer ${token}`)

    page1.assertStatus(200)
    const first = unwrapList(page1.body())
    assert.lengthOf(first.items, 2)
    assert.exists(first.meta)
    assert.equal(first.meta!.perPage, 2)
    assert.equal(first.meta!.currentPage, 1)
    assert.isAtLeast(first.meta!.total, 3)
    assert.isAtLeast(first.meta!.lastPage, 2)

    const page2 = await client
      .get('/api/v1/notifications')
      .qs({ page: 2, limit: 2 })
      .header('Authorization', `Bearer ${token}`)

    page2.assertStatus(200)
    const second = unwrapList(page2.body())
    assert.isAtLeast(second.items.length, 1)
    assert.equal(second.meta!.currentPage, 2)
    const page1Ids = first.items.map((item) => item.id)
    assert.isFalse(second.items.some((item) => page1Ids.includes(item.id)))
  })

  test('rejects invalid pagination query', async ({ client }) => {
    const token = await mintDemoToken(DEMO_USERS.northstarOwner)
    const response = await client
      .get('/api/v1/notifications')
      .qs({ page: 0, limit: 101 })
      .header('Authorization', `Bearer ${token}`)

    response.assertStatus(422)
  })

  test('marks a single owned unread notification as read', async ({ client, assert }) => {
    const created = await seedNotification({
      organizationId: FIXTURE_IDS.orgs.northstar,
      userId: FIXTURE_IDS.users.northstarOwner,
      title: 'Mark me',
    })
    createdIds.push(created.id)
    assert.isNull(created.readAt)

    const token = await mintDemoToken(DEMO_USERS.northstarOwner)
    const response = await client
      .patch(`/api/v1/notifications/${created.id}/read`)
      .header('Authorization', `Bearer ${token}`)

    response.assertStatus(200)
    const updated = unwrapNotification(response.body())
    assert.exists(updated)
    assert.equal(updated!.id, created.id)
    assert.isNotNull(updated!.readAt)

    const persisted = await db.from('notifications').where('id', created.id).firstOrFail()
    assert.isNotNull(persisted.readAt)
  })

  test('mark as read is idempotent when already read', async ({ client, assert }) => {
    const readAt = new Date('2026-08-01T12:00:00.000Z')
    const created = await seedNotification({
      organizationId: FIXTURE_IDS.orgs.northstar,
      userId: FIXTURE_IDS.users.northstarOwner,
      title: 'Already read',
      readAt,
    })
    createdIds.push(created.id)

    const token = await mintDemoToken(DEMO_USERS.northstarOwner)
    const response = await client
      .patch(`/api/v1/notifications/${created.id}/read`)
      .header('Authorization', `Bearer ${token}`)

    response.assertStatus(200)
    const updated = unwrapNotification(response.body())
    assert.exists(updated)
    assert.isNotNull(updated!.readAt)

    const persisted = await db.from('notifications').where('id', created.id).firstOrFail()
    assert.isNotNull(persisted.readAt)
  })

  test('returns 404 for a missing notification id', async ({ client, assert }) => {
    const token = await mintDemoToken(DEMO_USERS.northstarOwner)
    const response = await client
      .patch(`/api/v1/notifications/${randomUUID()}/read`)
      .header('Authorization', `Bearer ${token}`)

    response.assertStatus(404)
    const body = errorBody(response)
    assert.equal(body.code, 'E_NOTIFICATION_NOT_FOUND')
    assert.equal(body.error, 'Notification not found')
  })

  test('returns 422 for a non-uuid notification id', async ({ client }) => {
    const token = await mintDemoToken(DEMO_USERS.northstarOwner)
    const response = await client
      .patch('/api/v1/notifications/not-a-uuid/read')
      .header('Authorization', `Bearer ${token}`)

    response.assertStatus(422)
  })

  test('cannot mark another user notification in the same org as read', async ({
    client,
    assert,
  }) => {
    const created = await seedNotification({
      organizationId: FIXTURE_IDS.orgs.northstar,
      userId: FIXTURE_IDS.users.northstarAdmin,
      title: 'Admin only',
    })
    createdIds.push(created.id)

    const token = await mintDemoToken(DEMO_USERS.northstarOwner)
    const response = await client
      .patch(`/api/v1/notifications/${created.id}/read`)
      .header('Authorization', `Bearer ${token}`)

    response.assertStatus(404)
    assert.equal(errorBody(response).code, 'E_NOTIFICATION_NOT_FOUND')

    const persisted = await db.from('notifications').where('id', created.id).firstOrFail()
    assert.isNull(persisted.readAt)
  })

  test('cannot mark a notification that belongs to another organization', async ({
    client,
    assert,
  }) => {
    const created = await seedNotification({
      organizationId: FIXTURE_IDS.orgs.harbor,
      userId: FIXTURE_IDS.users.harborOwner,
      title: 'Harbor only',
    })
    createdIds.push(created.id)

    const token = await mintDemoToken(DEMO_USERS.northstarOwner)
    const response = await client
      .patch(`/api/v1/notifications/${created.id}/read`)
      .header('Authorization', `Bearer ${token}`)

    response.assertStatus(404)
    assert.equal(errorBody(response).code, 'E_NOTIFICATION_NOT_FOUND')

    const persisted = await db.from('notifications').where('id', created.id).firstOrFail()
    assert.isNull(persisted.readAt)
  })

  test('mark all as read updates only the caller unread rows in the active org', async ({
    client,
    assert,
  }) => {
    const unreadA = await seedNotification({
      organizationId: FIXTURE_IDS.orgs.northstar,
      userId: FIXTURE_IDS.users.northstarOwner,
      title: 'Unread A',
    })
    const unreadB = await seedNotification({
      organizationId: FIXTURE_IDS.orgs.northstar,
      userId: FIXTURE_IDS.users.northstarOwner,
      title: 'Unread B',
    })
    const alreadyRead = await seedNotification({
      organizationId: FIXTURE_IDS.orgs.northstar,
      userId: FIXTURE_IDS.users.northstarOwner,
      title: 'Already read',
      readAt: new Date('2026-08-01T12:00:00.000Z'),
    })
    const teammateUnread = await seedNotification({
      organizationId: FIXTURE_IDS.orgs.northstar,
      userId: FIXTURE_IDS.users.northstarAdmin,
      title: 'Admin unread',
    })
    const otherOrgUnread = await seedNotification({
      organizationId: FIXTURE_IDS.orgs.harbor,
      userId: FIXTURE_IDS.users.harborOwner,
      title: 'Harbor unread',
    })
    createdIds.push(unreadA.id, unreadB.id, alreadyRead.id, teammateUnread.id, otherOrgUnread.id)

    const token = await mintDemoToken(DEMO_USERS.northstarOwner)
    const response = await client
      .patch('/api/v1/notifications/read-all')
      .header('Authorization', `Bearer ${token}`)

    response.assertStatus(200)
    const body = response.body() as { data?: { updatedCount: number }; updatedCount?: number }
    const updatedCount = body.data?.updatedCount ?? body.updatedCount
    assert.equal(updatedCount, 2)

    const ownerRows = await db
      .from('notifications')
      .whereIn('id', [unreadA.id, unreadB.id, alreadyRead.id])
    assert.isTrue(ownerRows.every((row) => row.readAt !== null))

    const teammate = await db.from('notifications').where('id', teammateUnread.id).firstOrFail()
    assert.isNull(teammate.readAt)

    const foreign = await db.from('notifications').where('id', otherOrgUnread.id).firstOrFail()
    assert.isNull(foreign.readAt)
  })

  test('mark all as read returns zero when there are no unread notifications', async ({
    client,
    assert,
  }) => {
    await db.from('notifications').where('userId', FIXTURE_IDS.users.northstarOwner).delete()

    const token = await mintDemoToken(DEMO_USERS.northstarOwner)
    const response = await client
      .patch('/api/v1/notifications/read-all')
      .header('Authorization', `Bearer ${token}`)

    response.assertStatus(200)
    const body = response.body() as { data?: { updatedCount: number }; updatedCount?: number }
    const updatedCount = body.data?.updatedCount ?? body.updatedCount
    assert.equal(updatedCount, 0)
  })
})
