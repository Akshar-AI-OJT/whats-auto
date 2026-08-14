import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { randomUUID } from 'node:crypto'
import PlatformAiConfigService from '#services/ai/platform_ai_config_service'
import PlatformAiConfigException from '#exceptions/platform_ai_config_exception'

const DEFAULT_KEYWORDS = ['agent', 'human', 'representative', 'support', 'call me']

const DEFAULTS = {
  isEnabled: true,
  modelName: 'gpt-4o-mini',
  temperature: 0.2,
  campaignAttributionWindowHours: 48,
  minConfidenceScore: 0.7,
  debounceDelaySeconds: 4,
  systemPrompt: null as string | null,
  handoverKeywords: JSON.stringify(DEFAULT_KEYWORDS),
  workingSetSize: 6,
  summaryTurnThreshold: 10,
  embeddingModel: 'text-embedding-3-small',
  updatedByUserId: null as string | null,
}

async function restoreDefaults() {
  await db.from('platform_ai_configs').where('singletonKey', 'default').update(DEFAULTS)
}

test.group('PlatformAiConfigService', (group) => {
  group.each.teardown(async () => {
    await restoreDefaults()
  })

  test('returns the seeded singleton and never inserts a second row', async ({ assert }) => {
    const service = new PlatformAiConfigService()
    const config = await service.get()

    assert.equal(config.modelName, 'gpt-4o-mini')
    assert.equal(config.debounceDelaySeconds, 4)
    assert.deepEqual(config.handoverKeywords, DEFAULT_KEYWORDS)

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
      .update({ debounceDelaySeconds: 9, handoverKeywords: JSON.stringify(['help']) })

    const cached = await service.get()
    assert.equal(cached.debounceDelaySeconds, 4)
    assert.deepEqual(cached.handoverKeywords, DEFAULT_KEYWORDS)

    now = 31_000
    const fresh = await service.get()
    assert.equal(fresh.debounceDelaySeconds, 9)
    assert.deepEqual(fresh.handoverKeywords, ['help'])
  })

  test('update invalidates the cache and records the actor', async ({ assert }) => {
    const service = new PlatformAiConfigService()
    await service.get()

    const actorUserId = randomUUID()
    const updated = await service.update(
      { debounceDelaySeconds: 7, handoverKeywords: ['agent', 'human'] },
      actorUserId
    )

    assert.equal(updated.debounceDelaySeconds, 7)
    assert.deepEqual(updated.handoverKeywords, ['agent', 'human'])
    assert.equal(updated.updatedByUserId, actorUserId)

    const again = await service.get()
    assert.equal(again.debounceDelaySeconds, 7)
  })

  test('rejects a summary threshold below the working-set size', async ({ assert }) => {
    const service = new PlatformAiConfigService()
    await assert.rejects(
      () => service.update({ workingSetSize: 12, summaryTurnThreshold: 8 }, randomUUID()),
      PlatformAiConfigException
    )
  })
})
