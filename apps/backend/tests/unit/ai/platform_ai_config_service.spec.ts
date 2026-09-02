import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { randomUUID } from 'node:crypto'
import PlatformAiConfigService from '#services/ai/platform_ai_config_service'
import PlatformAiConfigException from '#exceptions/platform_ai_config_exception'
import { LlmChatProvider } from '#enums/llm_chat_provider'
import { catalogForProvider } from '#services/ai/platform_ai_models'
import { buildEmbeddingSpaceId } from '#services/ai/embedding_space'

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

async function seedActor() {
  const id = randomUUID()
  await db.table('users').insert({
    id,
    name: 'AI Config Actor',
    firstname: 'AI',
    lastname: 'Actor',
    email: `ai-config-${id.slice(0, 8)}@example.com`,
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  })
  return id
}

test.group('PlatformAiConfigService', (group) => {
  let actorUserId = ''

  group.setup(async () => {
    actorUserId = await seedActor()
  })

  group.each.teardown(async () => {
    await restoreDefaults()
  })

  test('returns the seeded singleton and never inserts a second row', async ({ assert }) => {
    const service = new PlatformAiConfigService()
    const config = await service.get()

    assert.equal(config.modelName, 'gpt-4o-mini')
    assert.equal(config.chatModel, 'gpt-4o-mini')
    assert.equal(config.chatProvider, 'openai')
    assert.equal(config.embeddingProvider, 'openai')
    assert.equal(config.activeEmbeddingSpaceId, 'openai:text-embedding-3-small:1024:v1')
    assert.equal(config.maxOutputTokens, 1024)
    assert.equal(config.reindexStatus, 'idle')
    assert.equal(config.debounceDelaySeconds, 4)

    const count = await db.from('platform_ai_configs').count('* as total').first()
    assert.equal(Number(count?.total), 1)
  })

  test('serves cached values until TTL, then reads the updated row', async ({ assert }) => {
    let now = 1_000
    const service = new PlatformAiConfigService({
      cacheTtlMs: 30_000,
      now: () => now,
    })

    const first = await service.get()
    assert.equal(first.debounceDelaySeconds, 4)

    await db
      .from('platform_ai_configs')
      .where('singletonKey', 'default')
      .update({ debounceDelaySeconds: 9 })

    const cached = await service.get()
    assert.equal(cached.debounceDelaySeconds, 4)

    now = 31_000
    const fresh = await service.get()
    assert.equal(fresh.debounceDelaySeconds, 9)
  })

  test('update invalidates the cache and records the actor', async ({ assert }) => {
    const service = new PlatformAiConfigService()
    await service.get()

    const updated = await service.update({ debounceDelaySeconds: 7 }, actorUserId)

    assert.equal(updated.debounceDelaySeconds, 7)
    assert.equal(updated.updatedByUserId, actorUserId)

    const again = await service.get()
    assert.equal(again.debounceDelaySeconds, 7)
  })

  test('rejects a summary threshold below the working-set size', async ({ assert }) => {
    const service = new PlatformAiConfigService()
    await assert.rejects(
      () => service.update({ workingSetSize: 12, summaryTurnThreshold: 8 }, actorUserId),
      PlatformAiConfigException
    )
  })

  test('dual-writes chatModel onto modelName', async ({ assert }) => {
    const service = new PlatformAiConfigService()
    const updated = await service.update({ chatModel: 'gpt-4o' }, actorUserId)
    assert.equal(updated.chatModel, 'gpt-4o')
    assert.equal(updated.modelName, 'gpt-4o')
  })

  test('rejects embeddingProvider that does not match chatProvider', async ({ assert }) => {
    const service = new PlatformAiConfigService()
    await assert.rejects(
      () =>
        service.update(
          { chatProvider: LlmChatProvider.Openai, embeddingProvider: LlmChatProvider.Mistral },
          actorUserId
        ),
      PlatformAiConfigException
    )
  })

  test('rejects a chat model that is not in the provider allowlist', async ({ assert }) => {
    const service = new PlatformAiConfigService({ countChunksInSpace: async () => 0 })
    try {
      await service.update({ chatModel: 'claude-3-haiku' }, actorUserId)
      assert.fail('expected invalidModel')
    } catch (error) {
      assert.instanceOf(error, PlatformAiConfigException)
      assert.equal((error as PlatformAiConfigException).code, 'E_PLATFORM_AI_INVALID_MODEL')
    }
  })

  test('rejects a summary model from another provider', async ({ assert }) => {
    const service = new PlatformAiConfigService({ countChunksInSpace: async () => 0 })
    const foreign = catalogForProvider(LlmChatProvider.Mistral).defaults.chatModel
    try {
      await service.update({ summaryModel: foreign }, actorUserId)
      assert.fail('expected invalidModel')
    } catch (error) {
      assert.instanceOf(error, PlatformAiConfigException)
      assert.equal((error as PlatformAiConfigException).code, 'E_PLATFORM_AI_INVALID_MODEL')
    }
  })

  test('allows a debounce-only patch when the stored chat model is not in the allowlist', async ({
    assert,
  }) => {
    await db
      .from('platform_ai_configs')
      .where('singletonKey', 'default')
      .update({ chatModel: 'gpt-4-turbo', modelName: 'gpt-4-turbo' })

    const service = new PlatformAiConfigService({
      countChunksInSpace: async () => {
        throw new Error('chunk count must not run on a chat-only patch')
      },
    })
    const updated = await service.update({ debounceDelaySeconds: 5 }, actorUserId)
    assert.equal(updated.chatModel, 'gpt-4-turbo')
    assert.equal(updated.debounceDelaySeconds, 5)
    assert.equal(updated.activeEmbeddingSpaceId, 'openai:text-embedding-3-small:1024:v1')
  })

  test('chat-only model change does not count chunks or flip the embedding space', async ({
    assert,
  }) => {
    const service = new PlatformAiConfigService({
      countChunksInSpace: async () => {
        throw new Error('chunk count must not run on a chat-only patch')
      },
    })
    const updated = await service.update({ chatModel: 'gpt-4o' }, actorUserId)
    assert.equal(updated.chatModel, 'gpt-4o')
    assert.equal(updated.modelName, 'gpt-4o')
    assert.equal(updated.chatProvider, 'openai')
    assert.equal(updated.activeEmbeddingSpaceId, 'openai:text-embedding-3-small:1024:v1')
  })

  test('provider change with an empty space applies catalog defaults and flips the space', async ({
    assert,
  }) => {
    const google = catalogForProvider(LlmChatProvider.Google)
    const service = new PlatformAiConfigService({ countChunksInSpace: async () => 0 })
    const updated = await service.update({ chatProvider: LlmChatProvider.Google }, actorUserId)
    assert.equal(updated.chatProvider, 'google')
    assert.equal(updated.embeddingProvider, 'google')
    assert.equal(updated.chatModel, google.defaults.chatModel)
    assert.equal(updated.summaryModel, google.defaults.summaryModel)
    assert.equal(updated.embeddingModel, google.defaults.embeddingModel)
    assert.equal(
      updated.activeEmbeddingSpaceId,
      buildEmbeddingSpaceId(LlmChatProvider.Google, google.defaults.embeddingModel)
    )
  })

  test('embed model change with an empty space flips the space id', async ({ assert }) => {
    const service = new PlatformAiConfigService({ countChunksInSpace: async () => 0 })
    const updated = await service.update({ embeddingModel: 'text-embedding-3-large' }, actorUserId)
    assert.equal(updated.embeddingModel, 'text-embedding-3-large')
    assert.equal(updated.chatProvider, 'openai')
    assert.equal(updated.activeEmbeddingSpaceId, 'openai:text-embedding-3-large:1024:v1')
  })

  test('blocks provider change when the active space still has chunks', async ({ assert }) => {
    let countedSpace = ''
    const service = new PlatformAiConfigService({
      countChunksInSpace: async (spaceId) => {
        countedSpace = spaceId
        return 4
      },
    })
    try {
      await service.update({ chatProvider: LlmChatProvider.Mistral }, actorUserId)
      assert.fail('expected reindexRequired')
    } catch (error) {
      assert.instanceOf(error, PlatformAiConfigException)
      assert.equal((error as PlatformAiConfigException).code, 'E_PLATFORM_AI_REINDEX_REQUIRED')
      assert.equal((error as PlatformAiConfigException).status, 409)
    }
    assert.equal(countedSpace, 'openai:text-embedding-3-small:1024:v1')
    const still = await service.get()
    assert.equal(still.chatProvider, 'openai')
    assert.equal(still.activeEmbeddingSpaceId, 'openai:text-embedding-3-small:1024:v1')
  })

  test('confirmReindex keeps the live space and enqueues a reindex job', async ({ assert }) => {
    const google = catalogForProvider(LlmChatProvider.Google)
    let enqueued = 0
    const service = new PlatformAiConfigService({
      countChunksInSpace: async () => 4,
      enqueueReindex: async () => {
        enqueued += 1
      },
    })

    const updated = await service.update(
      { chatProvider: LlmChatProvider.Google, confirmReindex: true },
      actorUserId
    )

    assert.equal(enqueued, 1)
    assert.equal(updated.chatProvider, 'google')
    assert.equal(updated.chatModel, google.defaults.chatModel)
    assert.equal(updated.summaryModel, google.defaults.summaryModel)
    assert.equal(updated.embeddingProvider, 'openai')
    assert.equal(updated.embeddingModel, 'text-embedding-3-small')
    assert.equal(updated.activeEmbeddingSpaceId, 'openai:text-embedding-3-small:1024:v1')
    assert.equal(updated.reindexStatus, 'running')
    assert.equal(updated.reindexFromSpaceId, 'openai:text-embedding-3-small:1024:v1')
    assert.equal(
      updated.reindexToSpaceId,
      buildEmbeddingSpaceId(LlmChatProvider.Google, google.defaults.embeddingModel)
    )
    assert.equal(updated.reindexEmbeddingModel, google.defaults.embeddingModel)
    assert.equal(updated.reindexEmbeddingProvider, 'google')
  })

  test('blocks a second embed-identity change while reindex is running', async ({ assert }) => {
    const google = catalogForProvider(LlmChatProvider.Google)
    await db
      .from('platform_ai_configs')
      .where('singletonKey', 'default')
      .update({
        chatProvider: 'google',
        chatModel: google.defaults.chatModel,
        summaryModel: google.defaults.summaryModel,
        embeddingProvider: 'openai',
        embeddingModel: 'text-embedding-3-small',
        reindexStatus: 'running',
        reindexFromSpaceId: 'openai:text-embedding-3-small:1024:v1',
        reindexToSpaceId: buildEmbeddingSpaceId(
          LlmChatProvider.Google,
          google.defaults.embeddingModel
        ),
        reindexEmbeddingModel: google.defaults.embeddingModel,
        reindexEmbeddingProvider: 'google',
      })

    const service = new PlatformAiConfigService({
      countChunksInSpace: async () => 4,
      enqueueReindex: async () => {
        throw new Error('must not enqueue')
      },
    })
    try {
      await service.update(
        { chatProvider: LlmChatProvider.Mistral, confirmReindex: true },
        actorUserId
      )
      assert.fail('expected reindexInProgress')
    } catch (error) {
      assert.instanceOf(error, PlatformAiConfigException)
      assert.equal((error as PlatformAiConfigException).code, 'E_PLATFORM_AI_REINDEX_IN_PROGRESS')
    }
  })

  test('allows a debounce-only patch while reindex is running', async ({ assert }) => {
    const google = catalogForProvider(LlmChatProvider.Google)
    const toSpace = buildEmbeddingSpaceId(LlmChatProvider.Google, google.defaults.embeddingModel)
    await db.from('platform_ai_configs').where('singletonKey', 'default').update({
      chatProvider: 'google',
      chatModel: google.defaults.chatModel,
      embeddingProvider: 'openai',
      embeddingModel: 'text-embedding-3-small',
      reindexStatus: 'running',
      reindexFromSpaceId: 'openai:text-embedding-3-small:1024:v1',
      reindexToSpaceId: toSpace,
      reindexEmbeddingModel: google.defaults.embeddingModel,
      reindexEmbeddingProvider: 'google',
    })

    const service = new PlatformAiConfigService({
      countChunksInSpace: async () => {
        throw new Error('chunk count must not run while targeting the pending space')
      },
      enqueueReindex: async () => {
        throw new Error('must not enqueue')
      },
    })
    const updated = await service.update(
      {
        chatProvider: LlmChatProvider.Google,
        embeddingModel: google.defaults.embeddingModel,
        debounceDelaySeconds: 6,
      },
      actorUserId
    )
    assert.equal(updated.debounceDelaySeconds, 6)
    assert.equal(updated.reindexStatus, 'running')
    assert.equal(updated.embeddingProvider, 'openai')
    assert.equal(updated.activeEmbeddingSpaceId, 'openai:text-embedding-3-small:1024:v1')
  })

  test('a debounce-only patch does not clear a running reindex', async ({ assert }) => {
    const google = catalogForProvider(LlmChatProvider.Google)
    const toSpace = buildEmbeddingSpaceId(LlmChatProvider.Google, google.defaults.embeddingModel)
    await db.from('platform_ai_configs').where('singletonKey', 'default').update({
      chatProvider: 'google',
      chatModel: google.defaults.chatModel,
      embeddingProvider: 'openai',
      embeddingModel: 'text-embedding-3-small',
      reindexStatus: 'running',
      reindexFromSpaceId: 'openai:text-embedding-3-small:1024:v1',
      reindexToSpaceId: toSpace,
      reindexEmbeddingModel: google.defaults.embeddingModel,
      reindexEmbeddingProvider: 'google',
    })

    const service = new PlatformAiConfigService({
      enqueueReindex: async () => {
        throw new Error('must not enqueue')
      },
    })
    const updated = await service.update({ debounceDelaySeconds: 9 }, actorUserId)
    assert.equal(updated.debounceDelaySeconds, 9)
    assert.equal(updated.reindexStatus, 'running')
    assert.equal(updated.reindexToSpaceId, toSpace)
    assert.equal(updated.embeddingProvider, 'openai')
  })

  test('retries a failed reindex when confirmReindex targets the pending space', async ({
    assert,
  }) => {
    const google = catalogForProvider(LlmChatProvider.Google)
    const toSpace = buildEmbeddingSpaceId(LlmChatProvider.Google, google.defaults.embeddingModel)
    await db.from('platform_ai_configs').where('singletonKey', 'default').update({
      chatProvider: 'google',
      chatModel: google.defaults.chatModel,
      embeddingProvider: 'openai',
      embeddingModel: 'text-embedding-3-small',
      reindexStatus: 'failed',
      reindexFromSpaceId: 'openai:text-embedding-3-small:1024:v1',
      reindexToSpaceId: toSpace,
      reindexEmbeddingModel: google.defaults.embeddingModel,
      reindexEmbeddingProvider: 'google',
    })

    let enqueued = 0
    const service = new PlatformAiConfigService({
      enqueueReindex: async () => {
        enqueued += 1
      },
    })
    const updated = await service.update(
      {
        chatProvider: LlmChatProvider.Google,
        embeddingModel: google.defaults.embeddingModel,
        confirmReindex: true,
      },
      actorUserId
    )
    assert.equal(enqueued, 1)
    assert.equal(updated.reindexStatus, 'running')
    assert.equal(updated.embeddingProvider, 'openai')
  })

  test('completeReindex flips the live space then clears pending fields', async ({ assert }) => {
    const google = catalogForProvider(LlmChatProvider.Google)
    const toSpace = buildEmbeddingSpaceId(LlmChatProvider.Google, google.defaults.embeddingModel)
    await db.from('platform_ai_configs').where('singletonKey', 'default').update({
      chatProvider: 'google',
      chatModel: google.defaults.chatModel,
      embeddingProvider: 'openai',
      embeddingModel: 'text-embedding-3-small',
      reindexStatus: 'running',
      reindexFromSpaceId: 'openai:text-embedding-3-small:1024:v1',
      reindexToSpaceId: toSpace,
      reindexEmbeddingModel: google.defaults.embeddingModel,
      reindexEmbeddingProvider: 'google',
    })

    const service = new PlatformAiConfigService()
    const flipped = await service.completeReindex()
    assert.equal(flipped.fromSpaceId, 'openai:text-embedding-3-small:1024:v1')
    assert.equal(flipped.toSpaceId, toSpace)

    const config = await service.get()
    assert.equal(config.embeddingProvider, 'google')
    assert.equal(config.embeddingModel, google.defaults.embeddingModel)
    assert.equal(config.activeEmbeddingSpaceId, toSpace)
    assert.equal(config.reindexStatus, 'idle')
    assert.isNull(config.reindexToSpaceId)
  })
})
