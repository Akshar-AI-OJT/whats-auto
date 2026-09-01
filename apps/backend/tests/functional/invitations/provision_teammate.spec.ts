import { test } from '@japa/runner'
import { randomUUID } from 'node:crypto'
import db from '@adonisjs/lucid/services/db'
import { DEMO_PASSWORD, DEMO_USERS } from '#database/demo/credentials'
import { FIXTURE_IDS } from '#database/demo/fixture_ids'
import { ensureDemoFixtures } from '#tests/helpers/ensure_demo_fixtures'
import { auth } from '#lib/auth'
import { AccessTokenClaimsService } from '#services/access_token_claims_service'
import { InvitationService } from '#services/invitation_service'
import InvitationException from '#exceptions/invitation_exception'

async function mintTokenForOrg(email: string, organizationId: string): Promise<string> {
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

  await db
    .from('sessions')
    .where('id', sessionRow.id)
    .update({ activeOrganizationId: organizationId })

  const payload = await new AccessTokenClaimsService().build({
    user: {
      id: result.user.id,
      email,
      name: result.user.name ?? email,
    },
    session: { id: sessionRow.id as string, activeOrganizationId: organizationId },
  })

  const signed = await auth.api.signJWT({
    body: { payload: payload as Record<string, unknown> },
  })
  const token = (signed as { token?: string } | null)?.token
  if (!token) throw new Error(`signJWT returned no token for ${email}`)
  return token
}

test.group('Provision teammate', (group) => {
  group.setup(async () => {
    await ensureDemoFixtures()
  })

  test('provisionTeammate creates user, membership, invitation, and verification row', async ({
    assert,
  }) => {
    const email = `provision-${randomUUID().slice(0, 8)}@example.com`
    const orgId = FIXTURE_IDS.orgs.northstar
    const owner = await db
      .from('users')
      .where('email', DEMO_USERS.northstarOwner)
      .select('id')
      .firstOrFail()

    const result = await new InvitationService().provisionTeammate({
      organizationId: orgId,
      inviterId: owner.id as string,
      email,
      firstname: 'Provision',
      lastname: 'Test',
      role: 'agent',
      designation: 'Support',
    })

    assert.equal(result.email, email)
    assert.isTrue(result.needsSetup)

    const user = await db.from('users').whereRaw('LOWER(email) = ?', [email]).first()
    assert.exists(user)
    assert.isFalse(Boolean(user?.emailVerified))

    const member = await db
      .from('organization_members')
      .where('organizationId', orgId)
      .where('userId', user!.id)
      .where('isDeleted', false)
      .first()
    assert.exists(member)

    const invite = await db
      .from('organization_invitations')
      .where('id', result.invitationId)
      .first()
    assert.equal(invite?.status, 'pending')
    assert.isNotNull(invite?.tokenHash)

    const verification = await db
      .from('verifications')
      .where('value', user!.id)
      .where('identifier', 'like', 'reset-password:%')
      .first()
    assert.exists(verification)
  })

  test('provisionTeammate rejects superadmin email', async ({ assert }) => {
    const orgId = FIXTURE_IDS.orgs.northstar
    const owner = await db
      .from('users')
      .where('email', DEMO_USERS.northstarOwner)
      .select('id')
      .firstOrFail()

    const superadmin = await db
      .from('users')
      .where('email', DEMO_USERS.superadmin)
      .select('id')
      .firstOrFail()

    try {
      await new InvitationService().provisionTeammate({
        organizationId: orgId,
        inviterId: owner.id as string,
        email: DEMO_USERS.superadmin,
        firstname: 'Super',
        role: 'agent',
      })
      assert.fail('expected superadmin guard')
    } catch (error) {
      assert.instanceOf(error, InvitationException)
      assert.equal((error as InvitationException).code, 'E_SUPERADMIN_NOT_INVITABLE')
    }

    const member = await db
      .from('organization_members')
      .where('organizationId', orgId)
      .where('userId', superadmin.id)
      .where('isDeleted', false)
      .first()
    assert.isNull(member)

    const invite = await db
      .from('organization_invitations')
      .where('organizationId', orgId)
      .whereRaw('LOWER(email) = ?', [DEMO_USERS.superadmin.toLowerCase()])
      .where('status', 'pending')
      .first()
    assert.isNull(invite)
  })

  test('provisionTeammate rejects owner of this org', async ({ assert }) => {
    const orgId = FIXTURE_IDS.orgs.northstar

    try {
      await new InvitationService().provisionTeammate({
        organizationId: orgId,
        inviterId: FIXTURE_IDS.users.northstarOwner,
        email: DEMO_USERS.northstarOwner,
        firstname: 'Owner',
        role: 'agent',
      })
      assert.fail('expected owner guard')
    } catch (error) {
      assert.instanceOf(error, InvitationException)
      assert.equal((error as InvitationException).code, 'E_INVITE_OWNER_PROTECTED')
    }
  })

  test('POST invitations provisions teammate via HTTP', async ({ client, assert }) => {
    const email = `http-provision-${randomUUID().slice(0, 8)}@example.com`
    const orgId = FIXTURE_IDS.orgs.northstar
    const token = await mintTokenForOrg(DEMO_USERS.northstarOwner, orgId)

    const response = await client
      .post(`/api/v1/organizations/${orgId}/invitations`)
      .header('Authorization', `Bearer ${token}`)
      .json({
        email,
        firstname: 'Http',
        lastname: 'Agent',
        role: 'agent',
      })

    response.assertStatus(200)
    const body = response.body() as { data?: { email?: string } }
    assert.equal(body.data?.email ?? (body as { email?: string }).email, email)
  })
})
