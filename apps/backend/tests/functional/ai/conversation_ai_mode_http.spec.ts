import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { ConversationAiMode } from '#enums/conversation_ai_mode'
import { DEMO_PASSWORD, DEMO_USERS } from '#database/demo/credentials'
import { FIXTURE_IDS } from '#database/demo/fixture_ids'
import DemoSeeder from '#database/seeders/demo_seeder'
import { auth } from '#lib/auth'
import { AccessTokenClaimsService } from '#services/access_token_claims_service'
import { runWithTenant } from '#services/tenant_context'

const CONV = FIXTURE_IDS.conversations.northstarOpen
const ORG = FIXTURE_IDS.orgs.northstar

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

async function setAiMode(aiMode: string, reason: string | null = null) {
  await runWithTenant(ORG, () =>
    db.from('conversations').where('id', CONV).update({
      aiMode,
      aiHandoverReason: reason,
    })
  )
}

test.group('Conversation AI mode HTTP', (group) => {
  group.setup(async () => {
    await db.from('jwks').delete()
    await new DemoSeeder(db.connection()).run()
  })

  group.each.teardown(async () => {
    await setAiMode(ConversationAiMode.AI_AUTO, null)
  })

  test('rejects unauthenticated takeover', async ({ client }) => {
    const response = await client.post(`/api/v1/inbox/conversations/${CONV}/ai/takeover`)
    response.assertStatus(401)
  })

  test('agent can take over and resume AI', async ({ client, assert }) => {
    const token = await mintToken(DEMO_USERS.northstarAgent, ORG)
    await setAiMode(ConversationAiMode.HANDOVER, 'low_confidence')

    const taken = await client
      .post(`/api/v1/inbox/conversations/${CONV}/ai/takeover`)
      .header('Authorization', `Bearer ${token}`)
    taken.assertStatus(200)
    assert.equal(taken.body().data.aiMode, ConversationAiMode.HUMAN_ACTIVE)
    assert.equal(taken.body().data.aiHandoverReason, 'takeover')

    const resumed = await client
      .post(`/api/v1/inbox/conversations/${CONV}/ai/resume`)
      .header('Authorization', `Bearer ${token}`)
    resumed.assertStatus(200)
    assert.equal(resumed.body().data.aiMode, ConversationAiMode.AI_AUTO)
    assert.isNull(resumed.body().data.aiHandoverReason)
  })
})
