import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { auth } from '#lib/auth'
import { mintAccessToken } from '#lib/mint_access_token'
import { runWithTenant } from '#services/tenant_context'
import DemoSeeder from '#database/seeders/demo_seeder'
import { DEMO_PASSWORD, DEMO_USERS } from '#database/demo/credentials'
import { FIXTURE_IDS } from '#database/demo/fixture_ids'

async function runDemoSeeder() {
  const seeder = new DemoSeeder(db.connection())
  await seeder.run()
}

test.group('Demo seeder functional', (group) => {
  group.each.setup(async () => {
    // Fresh-ish: demo seeder is idempotent; no full truncate (preserves migrations).
  })

  test('runs twice with stable fixture IDs and no duplicate demo rows', async ({ assert }) => {
    await runDemoSeeder()
    await runDemoSeeder()

    const memberCount = await db
      .from('organization_members')
      .where('organizationId', FIXTURE_IDS.orgs.northstar)
      .where('isDeleted', false)
      .count('* as total')
      .first()
    assert.equal(Number(memberCount?.total), 5)

    const inviteCount = await db
      .from('organization_invitations')
      .where('id', FIXTURE_IDS.invitations.northstarPending)
      .count('* as total')
      .first()
    assert.equal(Number(inviteCount?.total), 1)

    const messageCount = await db
      .from('messages')
      .whereIn('id', Object.values(FIXTURE_IDS.messages))
      .count('* as total')
      .first()
    assert.equal(Number(messageCount?.total), Object.keys(FIXTURE_IDS.messages).length)

    const paymentCount = await db
      .from('payment_transactions')
      .whereIn('id', Object.values(FIXTURE_IDS.payments))
      .count('* as total')
      .first()
    assert.equal(Number(paymentCount?.total), Object.keys(FIXTURE_IDS.payments).length)

    const org = await db.from('organizations').where('id', FIXTURE_IDS.orgs.northstar).first()
    assert.equal(org?.slug, 'northstar-home-goods')
  })

  test('preserves non-demo rows across reruns', async ({ assert }) => {
    await runDemoSeeder()

    const [extraPlan] = await db
      .table('plans')
      .insert({
        name: 'NonDemo Plan',
        price: 1,
        currency: 'INR',
        billingInterval: 'month',
        limits: { seats: 1 },
      })
      .returning('id')

    await runDemoSeeder()

    const stillThere = await db.from('plans').where('id', extraPlan.id).first()
    assert.exists(stillThere)

    await db.from('plans').where('id', extraPlan.id).delete()
  })

  test('sign-in mint JWT and JWKS endpoint work for demo owner', async ({ client, assert }) => {
    await runDemoSeeder()

    const signIn = await auth.api.signInEmail({
      body: { email: DEMO_USERS.northstarOwner, password: DEMO_PASSWORD },
    })
    const session = (signIn as { session?: { id: string }; user?: { id: string; name: string } })
      ?.session
    const user = (signIn as { user?: { id: string; name: string; email: string } })?.user
    assert.exists(session?.id)
    assert.exists(user?.id)

    const token = await mintAccessToken({
      userId: user!.id,
      email: DEMO_USERS.northstarOwner,
      name: user!.name,
      sessionId: session!.id,
    })
    assert.isString(token)
    assert.isAbove(token!.length, 20)

    const jwksResponse = await client.get('/api/auth/jwks')
    jwksResponse.assertStatus(200)
    const body = jwksResponse.body() as unknown as { keys?: unknown[] }
    assert.isArray(body.keys)
    assert.isAbove(body.keys!.length, 0)
  })

  test('RLS isolates contacts and messages between orgs', async ({ assert }) => {
    await runDemoSeeder()

    const northstarVisible = await runWithTenant(FIXTURE_IDS.orgs.northstar, async () => {
      return db.from('contacts').where('id', FIXTURE_IDS.contacts.harborJordan).first()
    })
    assert.notExists(northstarVisible)

    const harborContactFromHarbor = await runWithTenant(FIXTURE_IDS.orgs.harbor, async () => {
      return db.from('contacts').where('id', FIXTURE_IDS.contacts.harborJordan).first()
    })
    assert.exists(harborContactFromHarbor)

    const crossMessage = await runWithTenant(FIXTURE_IDS.orgs.harbor, async () => {
      return db.from('messages').where('id', FIXTURE_IDS.messages.northstarInboundText).first()
    })
    assert.notExists(crossMessage)

    const crossTemplate = await runWithTenant(FIXTURE_IDS.orgs.harbor, async () => {
      return db
        .from('message_templates')
        .where('id', FIXTURE_IDS.templates.northstarApprovedMarketing)
        .first()
    })
    assert.notExists(crossTemplate)

    const crossSub = await runWithTenant(FIXTURE_IDS.orgs.harbor, async () => {
      return db
        .from('organization_subscriptions')
        .where('id', FIXTURE_IDS.subscriptions.northstar)
        .first()
    })
    assert.notExists(crossSub)

    const crossUsage = await runWithTenant(FIXTURE_IDS.orgs.harbor, async () => {
      return db.from('usage_meters').where('id', FIXTURE_IDS.usageMeters.northstarMessages).first()
    })
    assert.notExists(crossUsage)
  })
})
