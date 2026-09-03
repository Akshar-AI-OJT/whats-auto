import { test } from '@japa/runner'
import { randomUUID } from 'node:crypto'
import db from '@adonisjs/lucid/services/db'
import { DEMO_PASSWORD, DEMO_USERS } from '#database/demo/credentials'
import { FIXTURE_IDS } from '#database/demo/fixture_ids'
import DemoSeeder from '#database/seeders/demo_seeder'
import { OrganizationStatus } from '#enums/organization_status'
import { auth } from '#lib/auth'
import { AccessTokenClaimsService } from '#services/access_token_claims_service'
import { BillingOrderApplyService } from '#services/billing/billing_order_apply_service'
import { OnboardingCleanupService } from '#services/onboarding_cleanup_service'
import { OrganizationService } from '#services/organization_service'
import { BillingCheckoutService } from '#services/billing/billing_checkout_service'
import { RazorpayOrderService } from '#services/billing/razorpay_order_service'
import { PlanRepository } from '#repositories/plan_repository'
import { OrganizationSubscriptionRepository } from '#repositories/organization_subscription_repository'
import { BillingOrderRepository } from '#repositories/billing_order_repository'
import { runWithTenant } from '#services/tenant_context'
import { DateTime } from 'luxon'

function errorBody(response: { body: () => unknown }): { code?: string; error?: string } {
  return response.body() as { code?: string; error?: string }
}

async function mintTokenForOrg(email: string, organizationId: string): Promise<string> {
  let result: { token?: string; user?: { id: string; name: string; email: string } }
  try {
    result = (await auth.api.signInEmail({
      body: { email, password: DEMO_PASSWORD },
    })) as { token?: string; user?: { id: string; name: string; email: string } }
  } catch (error) {
    throw new Error(
      `Failed to sign in ${email}: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error }
    )
  }

  if (!result.token || !result.user?.id) {
    throw new Error(`Failed to sign in ${email}: ${JSON.stringify(result)}`)
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
    body: { payload: payload as Record<string, any> },
  })
  const token = (signed as { token?: string } | null)?.token
  if (!token) {
    throw new Error(`signJWT returned no token for ${email}`)
  }
  return token
}

async function createPendingOrgOwnedBy(userId: string) {
  const organizationId = randomUUID()
  const slug = `pending-${organizationId.slice(0, 8)}`
  const ownerRoleId = await db
    .from('roles')
    .whereNull('organizationId')
    .where('name', 'owner')
    .select('id')
    .firstOrFail()

  await db.table('organizations').insert({
    id: organizationId,
    name: `Pending ${slug}`,
    slug,
    email: `${slug}@example.com`,
    phone: '+919876543210',
    country: 'IN',
    timezone: 'UTC',
    currency: 'INR',
    status: OrganizationStatus.PENDING_SETUP,
  })

  await db.table('organization_members').insert({
    organizationId,
    userId,
    roleId: ownerRoleId.id,
  })

  await db.table('user_roles').insert({
    userId,
    roleId: ownerRoleId.id,
    organizationId,
  })

  return organizationId
}

test.group('Org provisioning gate', (group) => {
  const orgIds: string[] = []

  group.setup(async () => {
    await db.from('jwks').delete()
    await new DemoSeeder(db.connection()).run()
  })

  group.each.teardown(async () => {
    while (orgIds.length > 0) {
      const organizationId = orgIds.pop()
      if (organizationId) {
        await runWithTenant(organizationId, async () => {
          await db.from('organizations').where('id', organizationId).delete()
        })
      }
    }
  })

  test('product route returns 402 E_ORG_PAYMENT_REQUIRED for pending_setup', async ({
    client,
    assert,
  }) => {
    const owner = await db
      .from('users')
      .where('email', DEMO_USERS.northstarOwner)
      .select('id')
      .firstOrFail()
    const organizationId = await createPendingOrgOwnedBy(owner.id as string)
    orgIds.push(organizationId)

    const token = await mintTokenForOrg(DEMO_USERS.northstarOwner, organizationId)
    const response = await client.get('/api/v1/contacts').header('Authorization', `Bearer ${token}`)

    response.assertStatus(402)
    assert.equal(errorBody(response).code, 'E_ORG_PAYMENT_REQUIRED')
  })

  test('billing opt-out still reachable for pending_setup', async ({ client, assert }) => {
    const owner = await db
      .from('users')
      .where('email', DEMO_USERS.northstarOwner)
      .select('id')
      .firstOrFail()
    const organizationId = await createPendingOrgOwnedBy(owner.id as string)
    orgIds.push(organizationId)

    const token = await mintTokenForOrg(DEMO_USERS.northstarOwner, organizationId)
    const response = await client
      .get('/api/v1/billing/plans')
      .header('Authorization', `Bearer ${token}`)

    response.assertStatus(200)
    assert.isDefined(response.body())
  })

  test('access-context opt-out returns status for pending_setup', async ({ client, assert }) => {
    const owner = await db
      .from('users')
      .where('email', DEMO_USERS.northstarOwner)
      .select('id')
      .firstOrFail()
    const organizationId = await createPendingOrgOwnedBy(owner.id as string)
    orgIds.push(organizationId)

    const token = await mintTokenForOrg(DEMO_USERS.northstarOwner, organizationId)
    const response = await client
      .get('/api/v1/access-context')
      .header('Authorization', `Bearer ${token}`)

    response.assertStatus(200)
    const body = response.body() as {
      data?: { status?: string }
      status?: string
    }
    const status = body.data?.status ?? body.status
    assert.equal(status, OrganizationStatus.PENDING_SETUP)
  })

  test('organizations mutate opt-out reachable for pending_setup', async ({ client, assert }) => {
    const owner = await db
      .from('users')
      .where('email', DEMO_USERS.northstarOwner)
      .select('id')
      .firstOrFail()
    const organizationId = await createPendingOrgOwnedBy(owner.id as string)
    orgIds.push(organizationId)

    const token = await mintTokenForOrg(DEMO_USERS.northstarOwner, organizationId)
    const response = await client
      .patch(`/api/v1/organizations/${organizationId}`)
      .header('Authorization', `Bearer ${token}`)
      .json({ name: 'Pending Renamed' })

    response.assertStatus(200)
  })

  test('applyPaidOrder promotes status to active', async ({ assert }) => {
    const organizationId = randomUUID()
    const planId = randomUUID()
    const gatewayOrderId = `order_${organizationId.slice(0, 8)}`
    const slug = `prov-${organizationId.slice(0, 8)}`
    const now = DateTime.utc()
    orgIds.push(organizationId)

    await db.table('organizations').insert({
      id: organizationId,
      name: `Prov ${slug}`,
      slug,
      email: `${slug}@example.com`,
      phone: '+919876543210',
      country: 'IN',
      timezone: 'UTC',
      currency: 'INR',
      status: OrganizationStatus.PENDING_SETUP,
    })

    await db.table('plans').insert({
      id: planId,
      code: `growth_${organizationId.slice(0, 8)}`,
      name: 'Growth Prov',
      price: 2499,
      currency: 'INR',
      billingInterval: 'month',
      billingIntervalCount: 1,
      trialDays: 0,
      gateway: null,
      gatewayPlanId: null,
      limits: { seats: 15 },
      isActive: true,
      sortOrder: 20,
      metadata: {},
    })

    await runWithTenant(organizationId, async () => {
      await db.table('billing_orders').insert({
        organizationId,
        planId,
        gateway: 'razorpay',
        gatewayOrderId,
        purpose: 'new_subscription',
        status: 'created',
        amount: 2499,
        taxRate: 0,
        tax: 0,
        total: 2499,
        currency: 'INR',
        periodStart: now.toJSDate(),
        periodEnd: now.plus({ months: 1 }).toJSDate(),
        planSnapshot: {
          code: `growth_${organizationId.slice(0, 8)}`,
          name: 'Growth Prov',
          price: 2499,
          currency: 'INR',
          interval: 'month',
          intervalCount: 1,
          limits: {},
        },
        receipt: `bo_${organizationId.slice(0, 8)}`,
        expiresAt: now.plus({ minutes: 30 }).toJSDate(),
        metadata: {},
      })
    })

    const result = await new BillingOrderApplyService().applyPaidOrder({
      gatewayOrderId,
      gatewayPaymentId: `pay_${organizationId.slice(0, 8)}`,
      source: 'verify',
      organizationId,
    })

    assert.isNotNull(result)
    const org = await db
      .from('organizations')
      .where('id', organizationId)
      .select('status')
      .firstOrFail()
    assert.equal(org.status, OrganizationStatus.ACTIVE)
  })

  test('second organization create does not switch session away from active org', async ({
    assert,
  }) => {
    const owner = await db
      .from('users')
      .where('email', DEMO_USERS.northstarOwner)
      .select('id', 'email', 'name')
      .firstOrFail()

    const session = await db
      .from('sessions')
      .where('userId', owner.id)
      .orderBy('createdAt', 'desc')
      .select('id', 'activeOrganizationId')
      .first()

    assert.isOk(session)
    await db
      .from('sessions')
      .where('id', session!.id)
      .update({ activeOrganizationId: FIXTURE_IDS.orgs.northstar })

    const slug = `second-${randomUUID().slice(0, 8)}`
    const created = await new OrganizationService().createOrganization({
      userId: owner.id as string,
      sessionId: session!.id as string,
      data: {
        name: 'Second Organization',
        slug,
        email: `${slug}@example.com`,
        phone: '+919876543210',
        organizationType: 'company',
        address: '221B Baker Street, Mumbai',
        pan: 'AAAAA0000A',
        gstin: '27AAAAA0000A1Z5',
        country: 'IN',
        timezone: 'Asia/Kolkata',
      },
    })
    orgIds.push(created.id)

    assert.equal(created.status, OrganizationStatus.PENDING_SETUP)
    assert.isFalse(created.sessionActivated)

    const refreshed = await db
      .from('sessions')
      .where('id', session!.id)
      .select('activeOrganizationId')
      .firstOrFail()
    assert.equal(refreshed.activeOrganizationId, FIXTURE_IDS.orgs.northstar)
  })

  test('set-active after second org create applies checkout to new org only', async ({
    assert,
  }) => {
    const owner = await db
      .from('users')
      .where('email', DEMO_USERS.northstarOwner)
      .select('id')
      .firstOrFail()

    const orgAId = FIXTURE_IDS.orgs.northstar
    const subsBeforeA = await runWithTenant(orgAId, async () =>
      db
        .from('organization_subscriptions')
        .where('organizationId', orgAId)
        .count('* as total')
        .first()
    )

    const session = await db
      .from('sessions')
      .where('userId', owner.id)
      .orderBy('createdAt', 'desc')
      .select('id', 'activeOrganizationId')
      .firstOrFail()

    await db.from('sessions').where('id', session.id).update({ activeOrganizationId: orgAId })

    const slug = `second-${randomUUID().slice(0, 8)}`
    const orgService = new OrganizationService()
    const created = await orgService.createOrganization({
      userId: owner.id as string,
      sessionId: session.id as string,
      data: {
        name: 'Second Organization',
        slug,
        email: `${slug}@example.com`,
        phone: '+919876543210',
        organizationType: 'company',
        address: '221B Baker Street, Mumbai',
        pan: 'AAAAA0000A',
        gstin: '27AAAAA0000A1Z5',
        country: 'IN',
        timezone: 'Asia/Kolkata',
      },
    })
    orgIds.push(created.id)
    assert.isFalse(created.sessionActivated)

    const sessionStillA = await db
      .from('sessions')
      .where('id', session.id)
      .select('activeOrganizationId')
      .firstOrFail()
    assert.equal(sessionStillA.activeOrganizationId, orgAId)

    const planId = randomUUID()
    await db.table('plans').insert({
      id: planId,
      code: `free_onboard_${planId.slice(0, 8)}`,
      name: 'Free Onboard Test',
      price: 0,
      currency: 'INR',
      billingInterval: 'month',
      billingIntervalCount: 1,
      trialDays: 0,
      gateway: null,
      gatewayPlanId: null,
      limits: { seats: 5 },
      isActive: true,
      sortOrder: 5,
      metadata: { status: 'active' },
    })

    try {
      // Mirrors frontend: explicit set-active when sessionActivated is false.
      await orgService.setActiveOrganization({
        userId: owner.id as string,
        sessionId: session.id as string,
        organizationId: created.id,
      })

      const sessionAfter = await db
        .from('sessions')
        .where('id', session.id)
        .select('activeOrganizationId')
        .firstOrFail()
      assert.equal(sessionAfter.activeOrganizationId, created.id)

      const checkout = new BillingCheckoutService(
        new PlanRepository(),
        new BillingOrderApplyService(),
        new RazorpayOrderService(
          new PlanRepository(),
          new OrganizationSubscriptionRepository(),
          new BillingOrderRepository(),
          {
            createCustomer: async () => ({ id: 'cust_test', email: 'a@b.com', name: 'Org' }),
            createOrder: async () => {
              throw new Error('Razorpay should not run for free checkout')
            },
            fetchOrder: async (orderId) => ({
              id: orderId,
              amount: 0,
              currency: 'INR',
              status: 'created',
            }),
          }
        )
      )

      const result = await checkout.checkout({
        organizationId: created.id,
        planId,
        actorUserId: owner.id as string,
      })
      assert.equal(result.mode, 'free')

      const orgBSub = await runWithTenant(created.id, async () =>
        db.from('organization_subscriptions').where('organizationId', created.id).first()
      )
      assert.exists(orgBSub)
      assert.equal(orgBSub?.planId, planId)

      const subsAfterA = await runWithTenant(orgAId, async () =>
        db
          .from('organization_subscriptions')
          .where('organizationId', orgAId)
          .count('* as total')
          .first()
      )
      assert.equal(Number(subsAfterA?.total ?? 0), Number(subsBeforeA?.total ?? 0))
    } finally {
      await runWithTenant(created.id, async () => {
        await db.from('billing_orders').where('organizationId', created.id).delete()
        await db.from('organization_subscriptions').where('organizationId', created.id).delete()
      })
      await db.from('plans').where('id', planId).delete()
    }
  })

  test('cleanup purges aged pending_setup org and cascades child rows under RLS', async ({
    assert,
  }) => {
    const organizationId = randomUUID()
    const slug = `purge-${organizationId.slice(0, 8)}`
    const createdAt = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000)

    await db.table('organizations').insert({
      id: organizationId,
      name: `Purge ${slug}`,
      slug,
      email: `${slug}@example.com`,
      phone: '+919876543210',
      country: 'IN',
      timezone: 'UTC',
      currency: 'INR',
      status: OrganizationStatus.PENDING_SETUP,
      createdAt,
    })

    await runWithTenant(organizationId, async () => {
      await db.table('contacts').insert({
        organizationId,
        phone: '+15551234001',
        phoneNormalized: '15551234001',
        name: 'Purge Contact',
      })
    })

    const contactsBefore = await runWithTenant(organizationId, async () => {
      return db.from('contacts').where('organizationId', organizationId).count('* as total').first()
    })
    assert.isTrue(Number(contactsBefore?.total ?? 0) >= 1)

    const result = await new OnboardingCleanupService().run({
      now: new Date(),
      pendingOrgMaxAgeDays: 30,
    })

    assert.isAtLeast(result.purgedOrganizations, 1)

    const orgAfter = await db.from('organizations').where('id', organizationId).first()
    assert.isNull(orgAfter)

    const contactsAfter = await db.from('contacts').where('organizationId', organizationId)
    assert.lengthOf(contactsAfter, 0)
  })
})
