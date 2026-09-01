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
import PlanRestrictionException from '#exceptions/plan_restriction_exception'

function parsePlanLimits(value: unknown): Record<string, unknown> {
  if (typeof value === 'string') return JSON.parse(value) as Record<string, unknown>
  return (value as Record<string, unknown>) ?? {}
}

async function ensureNorthstarSeatHeadroom(minSeats = 50) {
  const plan = await db.from('plans').where('id', FIXTURE_IDS.plans.growth).select('limits').first()
  const limits = parsePlanLimits(plan?.limits)
  if (Number(limits.seats ?? 0) < minSeats) {
    await db
      .from('plans')
      .where('id', FIXTURE_IDS.plans.growth)
      .update({ limits: { ...limits, seats: minSeats } })
  }
}

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
    await ensureNorthstarSeatHeadroom()
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

  test('provisionTeammate allows owner of another organization', async ({ assert }) => {
    const northstarId = FIXTURE_IDS.orgs.northstar
    const northstarOwner = await db
      .from('users')
      .where('email', DEMO_USERS.northstarOwner)
      .select('id')
      .firstOrFail()

    const existingMember = await db
      .from('organization_members')
      .where('organizationId', northstarId)
      .where('userId', FIXTURE_IDS.users.harborOwner)
      .where('isDeleted', false)
      .first()

    if (existingMember) {
      await db
        .from('organization_members')
        .where('id', existingMember.id)
        .update({ isDeleted: true, deletedAt: new Date().toISOString() })
    }

    const result = await new InvitationService().provisionTeammate({
      organizationId: northstarId,
      inviterId: northstarOwner.id as string,
      email: DEMO_USERS.harborOwner,
      firstname: 'Alex',
      role: 'admin',
    })

    assert.equal(result.email, DEMO_USERS.harborOwner)

    const member = await db
      .from('organization_members')
      .where('organizationId', northstarId)
      .where('userId', FIXTURE_IDS.users.harborOwner)
      .where('isDeleted', false)
      .first()
    assert.exists(member)
  })

  test('provisionTeammate rejects re-inviting soft-deleted owner via user_roles guard', async ({
    assert,
  }) => {
    const orgId = FIXTURE_IDS.orgs.northstar
    const ownerMemberId = FIXTURE_IDS.members.northstarOwner
    const memberBefore = await db.from('organization_members').where('id', ownerMemberId).first()

    await db.from('organization_members').where('id', ownerMemberId).update({
      isDeleted: true,
      deletedAt: new Date().toISOString(),
    })

    try {
      await new InvitationService().provisionTeammate({
        organizationId: orgId,
        inviterId: FIXTURE_IDS.users.northstarAdmin,
        email: DEMO_USERS.northstarOwner,
        firstname: 'Neha',
        role: 'agent',
      })
      assert.fail('expected owner guard')
    } catch (error) {
      assert.instanceOf(error, InvitationException)
      assert.equal((error as InvitationException).code, 'E_INVITE_OWNER_PROTECTED')
    } finally {
      await db
        .from('organization_members')
        .where('id', ownerMemberId)
        .update({
          isDeleted: memberBefore?.isDeleted ?? false,
          deletedAt: memberBefore?.deletedAt ?? null,
        })
    }
  })

  test('provisionTeammate accepts verified user without setup token', async ({ assert }) => {
    const northstarId = FIXTURE_IDS.orgs.northstar
    const northstarOwner = await db
      .from('users')
      .where('email', DEMO_USERS.northstarOwner)
      .select('id')
      .firstOrFail()

    const existingMember = await db
      .from('organization_members')
      .where('organizationId', northstarId)
      .where('userId', FIXTURE_IDS.users.harborAdmin)
      .where('isDeleted', false)
      .first()

    if (existingMember) {
      await db
        .from('organization_members')
        .where('id', existingMember.id)
        .update({ isDeleted: true, deletedAt: new Date().toISOString() })
    }

    const result = await new InvitationService().provisionTeammate({
      organizationId: northstarId,
      inviterId: northstarOwner.id as string,
      email: DEMO_USERS.harborAdmin,
      firstname: 'Jordan',
      role: 'viewer',
    })

    assert.isFalse(result.needsSetup)
    assert.isTrue(result.hasExistingPassword)

    const invite = await db
      .from('organization_invitations')
      .where('id', result.invitationId)
      .first()
    assert.equal(invite?.status, 'accepted')
    assert.isNull(invite?.tokenHash)

    const verification = await db
      .from('verifications')
      .where('value', FIXTURE_IDS.users.harborAdmin)
      .where('identifier', 'like', 'reset-password:%')
      .first()
    assert.isNull(verification)
  })

  test('provisionTeammate rejects when seat limit is reached', async ({ assert }) => {
    const orgId = FIXTURE_IDS.orgs.northstar
    const planId = FIXTURE_IDS.plans.growth
    const owner = await db
      .from('users')
      .where('email', DEMO_USERS.northstarOwner)
      .select('id')
      .firstOrFail()

    const memberCountRow = await db
      .from('organization_members')
      .where('organizationId', orgId)
      .where('isDeleted', false)
      .count('* as total')
      .first()
    const memberCount = Number(memberCountRow?.total ?? 0)

    const plan = await db.from('plans').where('id', planId).select('limits').first()
    const originalLimits = parsePlanLimits(plan?.limits)

    await db
      .from('plans')
      .where('id', planId)
      .update({ limits: { ...originalLimits, seats: memberCount } })

    try {
      await new InvitationService().provisionTeammate({
        organizationId: orgId,
        inviterId: owner.id as string,
        email: `seat-limit-${randomUUID().slice(0, 8)}@example.com`,
        firstname: 'Seat',
        role: 'agent',
      })
      assert.fail('expected seat limit guard')
    } catch (error) {
      assert.instanceOf(error, PlanRestrictionException)
      assert.equal((error as PlanRestrictionException).meta.key, 'seats')
    } finally {
      await db.from('plans').where('id', planId).update({ limits: originalLimits })
      await ensureNorthstarSeatHeadroom()
    }
  })

  test('resendSetupEmail rotates token for unverified member', async ({ assert }) => {
    const orgId = FIXTURE_IDS.orgs.northstar
    const email = `resend-${randomUUID().slice(0, 8)}@example.com`
    const owner = await db
      .from('users')
      .where('email', DEMO_USERS.northstarOwner)
      .select('id')
      .firstOrFail()

    const provisioned = await new InvitationService().provisionTeammate({
      organizationId: orgId,
      inviterId: owner.id as string,
      email,
      firstname: 'Resend',
      role: 'agent',
    })

    const member = await db
      .from('organization_members')
      .where('organizationId', orgId)
      .where('userId', provisioned.userId)
      .where('isDeleted', false)
      .firstOrFail()

    const inviteBefore = await db
      .from('organization_invitations')
      .where('id', provisioned.invitationId)
      .firstOrFail()

    await new InvitationService().resendSetupEmail({
      memberId: member.id as string,
      organizationId: orgId,
      actorUserId: owner.id as string,
    })

    const inviteAfter = await db
      .from('organization_invitations')
      .where('id', provisioned.invitationId)
      .firstOrFail()

    assert.notEqual(inviteBefore.tokenHash, inviteAfter.tokenHash)
    assert.equal(inviteAfter.status, 'pending')
  })

  test('resendSetupEmail rejects verified member', async ({ assert }) => {
    const orgId = FIXTURE_IDS.orgs.northstar
    const owner = await db
      .from('users')
      .where('email', DEMO_USERS.northstarOwner)
      .select('id')
      .firstOrFail()

    try {
      await new InvitationService().resendSetupEmail({
        memberId: FIXTURE_IDS.members.northstarAdmin,
        organizationId: orgId,
        actorUserId: owner.id as string,
      })
      assert.fail('expected password already set guard')
    } catch (error) {
      assert.instanceOf(error, InvitationException)
      assert.equal((error as InvitationException).code, 'E_INVITE_PASSWORD_ALREADY_SET')
    }
  })

  test('POST resend-invite rotates setup token via HTTP', async ({ client, assert }) => {
    const orgId = FIXTURE_IDS.orgs.northstar
    const email = `http-resend-${randomUUID().slice(0, 8)}@example.com`
    const token = await mintTokenForOrg(DEMO_USERS.northstarOwner, orgId)

    const provisionResponse = await client
      .post(`/api/v1/organizations/${orgId}/invitations`)
      .header('Authorization', `Bearer ${token}`)
      .json({
        email,
        firstname: 'Http',
        lastname: 'Resend',
        role: 'agent',
      })

    provisionResponse.assertStatus(200)
    const provisionBody = provisionResponse.body() as {
      data?: { userId?: string; invitationId?: string }
      userId?: string
      invitationId?: string
    }
    const userId = provisionBody.data?.userId ?? provisionBody.userId
    const invitationId = provisionBody.data?.invitationId ?? provisionBody.invitationId
    assert.exists(userId)
    assert.exists(invitationId)

    const member = await db
      .from('organization_members')
      .where('organizationId', orgId)
      .where('userId', userId!)
      .where('isDeleted', false)
      .firstOrFail()

    const inviteBefore = await db
      .from('organization_invitations')
      .where('id', invitationId!)
      .firstOrFail()

    const resendResponse = await client
      .post(`/api/v1/members/${member.id}/resend-invite`)
      .header('Authorization', `Bearer ${token}`)

    resendResponse.assertStatus(200)

    const inviteAfter = await db
      .from('organization_invitations')
      .where('id', invitationId!)
      .firstOrFail()

    assert.notEqual(inviteBefore.tokenHash, inviteAfter.tokenHash)
  })
})
