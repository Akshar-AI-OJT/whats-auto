import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { DEMO_PASSWORD, DEMO_USERS } from '#database/demo/credentials'
import { FIXTURE_IDS } from '#database/demo/fixture_ids'
import DemoSeeder from '#database/seeders/demo_seeder'
import { auth } from '#lib/auth'
import { AccessTokenClaimsService } from '#services/access_token_claims_service'
import { runWithTenant } from '#services/tenant_context'

const ACTIVE_ORG_BY_EMAIL: Record<string, string> = {
  [DEMO_USERS.northstarOwner]: FIXTURE_IDS.orgs.northstar,
  [DEMO_USERS.northstarAdmin]: FIXTURE_IDS.orgs.northstar,
  [DEMO_USERS.northstarViewer]: FIXTURE_IDS.orgs.northstar,
}

async function mintDemoToken(email: string): Promise<string> {
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

  const orgId = ACTIVE_ORG_BY_EMAIL[email]
  await db.from('sessions').where('id', sessionRow.id).update({ activeOrganizationId: orgId })

  const payload = await new AccessTokenClaimsService().build({
    user: {
      id: result.user.id,
      email,
      name: result.user.name ?? email,
    },
    session: { id: sessionRow.id as string, activeOrganizationId: orgId },
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

test.group('Organization SMTP HTTP', (group) => {
  group.setup(async () => {
    await db.from('jwks').delete()
    await new DemoSeeder(db.connection()).run()
  })

  group.teardown(async () => {
    await runWithTenant(FIXTURE_IDS.orgs.northstar, async () => {
      await db
        .from('organization_smtp_configs')
        .where('organizationId', FIXTURE_IDS.orgs.northstar)
        .delete()
    })
  })

  test('returns null config when unset', async ({ client, assert }) => {
    const token = await mintDemoToken(DEMO_USERS.northstarOwner)
    const response = await client
      .get(`/api/v1/organizations/${FIXTURE_IDS.orgs.northstar}/smtp`)
      .header('Authorization', `Bearer ${token}`)

    response.assertStatus(200)
    assert.isNull(response.body().data)
  })

  test('viewer cannot manage SMTP settings', async ({ client }) => {
    const token = await mintDemoToken(DEMO_USERS.northstarViewer)
    const response = await client
      .put(`/api/v1/organizations/${FIXTURE_IDS.orgs.northstar}/smtp`)
      .header('Authorization', `Bearer ${token}`)
      .json({
        transport: 'smtp',
        providerPreset: 'custom',
        senderName: 'Acme',
        senderEmail: 'notify@acme.com',
        host: 'smtp.example.com',
        port: 587,
        secure: false,
        username: 'user',
        password: 'secret',
      })

    response.assertStatus(403)
  })

  test('delete returns 404 when config missing', async ({ client, assert }) => {
    const token = await mintDemoToken(DEMO_USERS.northstarOwner)
    const response = await client
      .delete(`/api/v1/organizations/${FIXTURE_IDS.orgs.northstar}/smtp`)
      .header('Authorization', `Bearer ${token}`)

    response.assertStatus(404)
    assert.equal(response.body().code, 'E_SMTP_CONFIG_NOT_FOUND')
  })
})
