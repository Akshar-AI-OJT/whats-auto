import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { DEMO_PASSWORD, DEMO_USERS } from '#database/demo/credentials'
import { FIXTURE_IDS } from '#database/demo/fixture_ids'
import DemoSeeder from '#database/seeders/demo_seeder'
import { auth } from '#lib/auth'
import { LlmChatProvider } from '#enums/llm_chat_provider'
import { catalogForProvider } from '#services/ai/platform_ai_models'
import { AccessTokenClaimsService } from '#services/access_token_claims_service'

const DEFAULTS = {
  isEnabled: true,
  modelName: 'gpt-4o-mini',
  temperature: 0.2,
  campaignAttributionWindowHours: 48,
  minConfidenceScore: 0.7,
  debounceDelaySeconds: 4,
  systemPrompt: null as string | null,
  workingSetSize: 6,
  summaryTurnThreshold: 10,
  embeddingModel: 'text-embedding-3-small',
  chatProvider: 'openai',
  chatModel: 'gpt-4o-mini',
  summaryModel: null as string | null,
  embeddingProvider: 'openai',
  activeEmbeddingSpaceId: 'openai:text-embedding-3-small:1024:v1',
  maxOutputTokens: 1024,
  reindexStatus: 'idle',
  reindexFromSpaceId: null as string | null,
  reindexToSpaceId: null as string | null,
  reindexEmbeddingModel: null as string | null,
  reindexEmbeddingProvider: null as string | null,
  updatedByUserId: null as string | null,
}

async function restoreDefaults() {
  await db.from('platform_ai_configs').where('singletonKey', 'default').update(DEFAULTS)
}

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

function errorBody(response: { body: () => unknown }): { code?: string; error?: string } {
  return response.body() as { code?: string; error?: string }
}

test.group('Platform AI config HTTP', (group) => {
  group.setup(async () => {
    await db.from('jwks').delete()
    await new DemoSeeder(db.connection()).run()
  })

  group.each.teardown(async () => {
    await restoreDefaults()
  })

  test('rejects unauthenticated GET', async ({ client }) => {
    const response = await client.get('/api/v1/super-admin/ai-config')
    response.assertStatus(401)
  })

  test('rejects a tenant JWT on PATCH', async ({ client, assert }) => {
    const token = await mintToken(DEMO_USERS.northstarOwner, FIXTURE_IDS.orgs.northstar)
    const response = await client
      .patch('/api/v1/super-admin/ai-config')
      .header('Authorization', `Bearer ${token}`)
      .json({ debounceDelaySeconds: 8 })

    response.assertStatus(403)
    assert.equal(errorBody(response).code, 'PLATFORM_ACCESS_DENIED')
  })

  test('superadmin can GET and PATCH the singleton', async ({ client, assert }) => {
    const token = await mintToken(DEMO_USERS.superadmin)

    const shown = await client
      .get('/api/v1/super-admin/ai-config')
      .header('Authorization', `Bearer ${token}`)
    shown.assertStatus(200)
    assert.equal(shown.body().data.modelName, 'gpt-4o-mini')
    assert.equal(shown.body().data.chatModel, 'gpt-4o-mini')
    assert.equal(shown.body().data.chatProvider, 'openai')
    assert.equal(shown.body().data.maxOutputTokens, 1024)
    assert.equal(shown.body().data.reindexStatus, 'idle')
    assert.equal(shown.body().data.debounceDelaySeconds, 4)
    assert.isUndefined((shown.body().data as { singletonKey?: string }).singletonKey)

    const patched = await client
      .patch('/api/v1/super-admin/ai-config')
      .header('Authorization', `Bearer ${token}`)
      .json({
        debounceDelaySeconds: 8,
      })
    patched.assertStatus(200)
    assert.equal(patched.body().data.debounceDelaySeconds, 8)
    assert.isUndefined(patched.body().data.handoverKeywords)

    const again = await client
      .get('/api/v1/super-admin/ai-config')
      .header('Authorization', `Bearer ${token}`)
    again.assertStatus(200)
    assert.equal(again.body().data.debounceDelaySeconds, 8)
  })

  test('rejects out-of-range temperature', async ({ client }) => {
    const token = await mintToken(DEMO_USERS.superadmin)
    const response = await client
      .patch('/api/v1/super-admin/ai-config')
      .header('Authorization', `Bearer ${token}`)
      .json({ temperature: 3 })
    response.assertStatus(422)
  })

  test('rejects a summary threshold below working-set size', async ({ client, assert }) => {
    const token = await mintToken(DEMO_USERS.superadmin)
    const response = await client
      .patch('/api/v1/super-admin/ai-config')
      .header('Authorization', `Bearer ${token}`)
      .json({ workingSetSize: 12, summaryTurnThreshold: 5 })
    response.assertStatus(422)
    assert.equal(errorBody(response).code, 'E_PLATFORM_AI_CONFIG_SUMMARY_THRESHOLD')
  })

  test('rejects a chat model outside the provider allowlist', async ({ client, assert }) => {
    const token = await mintToken(DEMO_USERS.superadmin)
    const response = await client
      .patch('/api/v1/super-admin/ai-config')
      .header('Authorization', `Bearer ${token}`)
      .json({ chatModel: 'claude-3-haiku' })
    response.assertStatus(422)
    assert.equal(errorBody(response).code, 'E_PLATFORM_AI_INVALID_MODEL')
  })

  test('rejects a summary model from another provider', async ({ client, assert }) => {
    const token = await mintToken(DEMO_USERS.superadmin)
    const foreign = catalogForProvider(LlmChatProvider.Mistral).defaults.chatModel
    const response = await client
      .patch('/api/v1/super-admin/ai-config')
      .header('Authorization', `Bearer ${token}`)
      .json({ summaryModel: foreign })
    response.assertStatus(422)
    assert.equal(errorBody(response).code, 'E_PLATFORM_AI_INVALID_MODEL')
  })

  test('rejects embeddingProvider that does not match chatProvider', async ({ client, assert }) => {
    const token = await mintToken(DEMO_USERS.superadmin)
    const response = await client
      .patch('/api/v1/super-admin/ai-config')
      .header('Authorization', `Bearer ${token}`)
      .json({ embeddingProvider: 'mistral' })
    response.assertStatus(422)
    assert.equal(errorBody(response).code, 'E_PLATFORM_AI_EMBEDDING_PROVIDER_MISMATCH')
  })
})
