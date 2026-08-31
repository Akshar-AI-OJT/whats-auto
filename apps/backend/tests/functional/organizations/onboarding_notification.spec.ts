import { randomUUID } from 'node:crypto'
import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { DEMO_PASSWORD, DEMO_USERS } from '#database/demo/credentials'
import { FIXTURE_IDS } from '#database/demo/fixture_ids'
import DemoSeeder from '#database/seeders/demo_seeder'
import { auth } from '#lib/auth'
import { AccessTokenClaimsService } from '#services/access_token_claims_service'
import { OrganizationService } from '#services/organization_service'

const ONBOARDING_TYPE = 'organization_onboarding'

async function signInSession(email: string) {
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

  return {
    userId: result.user.id,
    sessionId: sessionRow.id as string,
    name: result.user.name ?? email,
    token: result.token,
  }
}

async function mintDemoToken(email: string, activeOrgId: string): Promise<string> {
  const session = await signInSession(email)
  await db
    .from('sessions')
    .where('id', session.sessionId)
    .update({ activeOrganizationId: activeOrgId })

  const payload = await new AccessTokenClaimsService().build({
    user: { id: session.userId, email, name: session.name },
    session: { id: session.sessionId, activeOrganizationId: activeOrgId },
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

function uniqueSlug(prefix: string) {
  return `${prefix}-${randomUUID().slice(0, 8)}`
}

function createOrgPayload(name: string, slug: string) {
  return {
    name,
    slug,
    email: `${slug}@example.com`,
    phone: '+919876543210',
    organizationType: 'company' as const,
    address: '221B Baker Street, Mumbai',
    pan: 'AAAAA0000A',
    country: 'IN',
    timezone: 'Asia/Kolkata',
  }
}

test.group('Organization onboarding notifications', (group) => {
  const orgIds: string[] = []

  group.setup(async () => {
    await db.from('jwks').delete()
    await new DemoSeeder(db.connection()).run()
  })

  group.each.teardown(async () => {
    while (orgIds.length > 0) {
      const organizationId = orgIds.pop()
      if (organizationId) {
        await db.from('organizations').where('id', organizationId).delete()
      }
    }
  })

  test('creating an organization notifies platform superadmins once', async ({ assert }) => {
    const session = await signInSession(DEMO_USERS.northstarOwner)
    const slug = uniqueSlug('onboard')

    const created = await new OrganizationService().createOrganization({
      userId: session.userId,
      sessionId: session.sessionId,
      data: createOrgPayload('Onboard Notice Org', slug),
    })
    orgIds.push(created.id)

    assert.equal(created.name, 'Onboard Notice Org')
    assert.equal(created.role, 'owner')

    const rows = await db
      .from('notifications')
      .where('organizationId', created.id)
      .where('type', ONBOARDING_TYPE)

    assert.lengthOf(rows, 1)
    const notification = rows[0]
    assert.equal(notification.userId, FIXTURE_IDS.users.superadmin)
    assert.equal(notification.organizationId, created.id)
    assert.equal(notification.type, ONBOARDING_TYPE)
    assert.equal(notification.title, 'New Organization Onboarding')
    assert.equal(notification.body, 'A new organization "Onboard Notice Org" has been created.')
    assert.equal(notification.actorUserId, session.userId)
    assert.isNull(notification.readAt)
    assert.isNotNull(notification.createdAt)
  })

  test('unrelated users and other organizations do not receive the onboarding notification', async ({
    assert,
  }) => {
    const session = await signInSession(DEMO_USERS.northstarOwner)
    const slug = uniqueSlug('onboard-iso')

    const created = await new OrganizationService().createOrganization({
      userId: session.userId,
      sessionId: session.sessionId,
      data: createOrgPayload('Isolation Org', slug),
    })
    orgIds.push(created.id)

    const rows = await db
      .from('notifications')
      .where('organizationId', created.id)
      .where('type', ONBOARDING_TYPE)

    const recipientIds = rows.map((row) => row.userId as string)
    assert.include(recipientIds, FIXTURE_IDS.users.superadmin)
    assert.notInclude(recipientIds, FIXTURE_IDS.users.northstarOwner)
    assert.notInclude(recipientIds, FIXTURE_IDS.users.northstarAdmin)
    assert.notInclude(recipientIds, FIXTURE_IDS.users.northstarAgent)
    assert.notInclude(recipientIds, FIXTURE_IDS.users.harborOwner)

    const leaked = await db
      .from('notifications')
      .where('type', ONBOARDING_TYPE)
      .where('organizationId', FIXTURE_IDS.orgs.harbor)
      .where('createdAt', '>=', created.createdAt)
    assert.lengthOf(leaked, 0)
  })

  test('the same onboarding create does not insert duplicate notifications', async ({ assert }) => {
    const session = await signInSession(DEMO_USERS.northstarOwner)
    const slug = uniqueSlug('onboard-dup')

    const created = await new OrganizationService().createOrganization({
      userId: session.userId,
      sessionId: session.sessionId,
      data: createOrgPayload('Duplicate Guard Org', slug),
    })
    orgIds.push(created.id)

    const rows = await db
      .from('notifications')
      .where('organizationId', created.id)
      .where('userId', FIXTURE_IDS.users.superadmin)
      .where('type', ONBOARDING_TYPE)

    assert.lengthOf(rows, 1)
    assert.equal(new Set(rows.map((row) => row.id)).size, 1)
  })

  test('HTTP organization create also notifies superadmins', async ({ client, assert }) => {
    const token = await mintDemoToken(DEMO_USERS.northstarOwner, FIXTURE_IDS.orgs.northstar)
    const slug = uniqueSlug('onboard-http')

    const response = await client
      .post('/api/v1/organizations')
      .header('Authorization', `Bearer ${token}`)
      .json(createOrgPayload('HTTP Onboard Org', slug))

    response.assertStatus(200)
    const body = response.body() as { data?: { id: string }; id?: string }
    const organizationId = body.data?.id ?? body.id
    assert.isString(organizationId)
    const orgId = organizationId as string
    orgIds.push(orgId)

    const rows = await db
      .from('notifications')
      .where('organizationId', orgId)
      .where('type', ONBOARDING_TYPE)

    assert.lengthOf(rows, 1)
    assert.equal(rows[0].userId, FIXTURE_IDS.users.superadmin)
    assert.equal(rows[0].title, 'New Organization Onboarding')
  })
})
