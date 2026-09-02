import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { DEMO_PASSWORD, DEMO_USERS } from '#database/demo/credentials'
import { FIXTURE_IDS } from '#database/demo/fixture_ids'
import DemoSeeder from '#database/seeders/demo_seeder'
import { auth } from '#lib/auth'
import { AccessTokenClaimsService } from '#services/access_token_claims_service'

function errorBody(response: { body: () => unknown }): {
  code?: string
  error?: string
  field?: string
} {
  return response.body() as { code?: string; error?: string; field?: string }
}

async function mintDemoToken(email: string): Promise<string> {
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

  const orgId = FIXTURE_IDS.orgs.northstar
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
    body: { payload: payload as Record<string, any> },
  })
  const token = (signed as { token?: string } | null)?.token
  if (!token) {
    throw new Error(`signJWT returned no token for ${email}: ${JSON.stringify(signed)}`)
  }
  return token
}

test.group('Organizations HTTP — slug uniqueness', (group) => {
  group.setup(async () => {
    await db.from('jwks').delete()
    await new DemoSeeder(db.connection()).run()
  })

  test('POST with existing slug returns 409 E_ORG_SLUG_ALREADY_EXISTS without SQL leak', async ({
    client,
    assert,
  }) => {
    const token = await mintDemoToken(DEMO_USERS.northstarOwner)

    const response = await client
      .post('/api/v1/organizations')
      .header('Authorization', `Bearer ${token}`)
      .json({
        name: 'Collision Org',
        slug: 'northstar-home-goods',
        email: 'collision@example.com',
        phone: '+919876543210',
        organizationType: 'company',
        address: '221B Baker Street, Mumbai',
        pan: 'AAAAA0000A',
        gstin: '27AAAAA0000A1Z5',
        country: 'IN',
        timezone: 'Asia/Kolkata',
      })

    response.assertStatus(409)
    const body = errorBody(response)
    assert.equal(body.code, 'E_ORG_SLUG_ALREADY_EXISTS')
    assert.equal(body.field, 'slug')
    assert.isTrue(typeof body.error === 'string' && /slug/i.test(body.error))
    assert.notInclude(JSON.stringify(body).toLowerCase(), 'insert into')
    assert.notInclude(JSON.stringify(body).toLowerCase(), '23505')
  })
})
