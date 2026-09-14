import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { auth } from '#lib/auth'
import { mintAccessToken } from '#lib/mint_access_token'
import DemoSeeder from '#database/seeders/demo_seeder'
import { DEMO_PASSWORD, DEMO_USERS } from '#database/demo/credentials'
import { FIXTURE_IDS } from '#database/demo/fixture_ids'

const RLS_READER_ROLE = 'whats_auto_rls_reader'

async function runDemoSeeder() {
  const seeder = new DemoSeeder(db.connection())
  await seeder.run()
}

/** Test DB connects as superuser (`postgres`), which bypasses RLS. */
async function ensureRlsReaderRole() {
  await db.rawQuery(`
    DO $role$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${RLS_READER_ROLE}') THEN
        CREATE ROLE ${RLS_READER_ROLE} NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE INHERIT NOLOGIN;
      END IF;
    END
    $role$;
  `)
  await db.rawQuery(`GRANT USAGE ON SCHEMA public TO ${RLS_READER_ROLE}`)
  await db.rawQuery(`GRANT SELECT ON ALL TABLES IN SCHEMA public TO ${RLS_READER_ROLE}`)
}

async function selectWithRls(organizationId: string, table: string, id: string) {
  return db.transaction(async (trx) => {
    await trx.rawQuery(`SET LOCAL ROLE ${RLS_READER_ROLE}`)
    await trx.rawQuery(`SELECT set_config('app.current_organization_id', ?, true)`, [
      organizationId,
    ])
    return trx.from(table).where('id', id).first()
  })
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
        code: 'non_demo_plan',
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

    const signIn = (await auth.api.signInEmail({
      body: { email: DEMO_USERS.northstarOwner, password: DEMO_PASSWORD },
    })) as { token?: string; user?: { id: string; name: string; email: string } }
    assert.exists(signIn.token)
    assert.exists(signIn.user?.id)

    const sessionRow = await db.from('sessions').where('token', signIn.token).select('id').first()
    assert.exists(sessionRow?.id)

    const token = await mintAccessToken({
      userId: signIn.user!.id,
      email: DEMO_USERS.northstarOwner,
      name: signIn.user!.name,
      sessionId: sessionRow!.id as string,
    })
    assert.isString(token)
    assert.isAbove(token!.length, 20)

    const authed = await client
      .get('/api/v1/onboarding/state')
      .header('Authorization', `Bearer ${token}`)
    authed.assertStatus(200)

    const jwksResponse = await client.get('/api/auth/jwks')
    jwksResponse.assertStatus(200)
    const parsed: unknown = JSON.parse(jwksResponse.text())
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      !('keys' in parsed) ||
      !Array.isArray(parsed.keys)
    ) {
      assert.fail('JWKS response did not include a keys array')
      return
    }
    assert.isAbove(parsed.keys.length, 0)
  })

  test('RLS isolates contacts and messages between orgs', async ({ assert }) => {
    await runDemoSeeder()
    await ensureRlsReaderRole()

    const northstarVisible = await selectWithRls(
      FIXTURE_IDS.orgs.northstar,
      'contacts',
      FIXTURE_IDS.contacts.harborJordan
    )
    assert.notExists(northstarVisible)

    const harborContactFromHarbor = await selectWithRls(
      FIXTURE_IDS.orgs.harbor,
      'contacts',
      FIXTURE_IDS.contacts.harborJordan
    )
    assert.exists(harborContactFromHarbor)

    const crossMessage = await selectWithRls(
      FIXTURE_IDS.orgs.harbor,
      'messages',
      FIXTURE_IDS.messages.northstarInboundText
    )
    assert.notExists(crossMessage)

    const crossTemplate = await selectWithRls(
      FIXTURE_IDS.orgs.harbor,
      'message_templates',
      FIXTURE_IDS.templates.northstarApprovedMarketing
    )
    assert.notExists(crossTemplate)

    const crossSub = await selectWithRls(
      FIXTURE_IDS.orgs.harbor,
      'organization_subscriptions',
      FIXTURE_IDS.subscriptions.northstar
    )
    assert.notExists(crossSub)

    const crossUsage = await selectWithRls(
      FIXTURE_IDS.orgs.harbor,
      'usage_meters',
      FIXTURE_IDS.usageMeters.northstarMessages
    )
    assert.notExists(crossUsage)
  })
})
