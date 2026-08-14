import db from '@adonisjs/lucid/services/db'
import env from '#start/env'
import PlatformAiConfigException from '#exceptions/platform_ai_config_exception'

export const PLATFORM_AI_CONFIG_CACHE_TTL_MS = 30_000
export const PLATFORM_AI_CONFIG_SINGLETON_KEY = 'default'

export type PlatformAiConfigSnapshot = {
  id: string
  isEnabled: boolean
  modelName: string
  temperature: number
  campaignAttributionWindowHours: number
  minConfidenceScore: number
  debounceDelaySeconds: number
  systemPrompt: string | null
  handoverKeywords: string[]
  workingSetSize: number
  summaryTurnThreshold: number
  embeddingModel: string
  updatedByUserId: string | null
  createdAt: string
  updatedAt: string | null
}

export type UpdatePlatformAiConfigDto = {
  isEnabled?: boolean
  modelName?: string
  temperature?: number
  campaignAttributionWindowHours?: number
  minConfidenceScore?: number
  debounceDelaySeconds?: number
  systemPrompt?: string | null
  handoverKeywords?: string[]
  workingSetSize?: number
  summaryTurnThreshold?: number
  embeddingModel?: string
}

export type PlatformAiConfigServiceOptions = {
  cacheTtlMs?: number
  now?: () => number
}

type CachedSnapshot = {
  value: PlatformAiConfigSnapshot
  expiresAt: number
}

type PlatformAiConfigRow = {
  id: string
  isEnabled: boolean
  modelName: string
  temperature: string | number
  campaignAttributionWindowHours: number
  minConfidenceScore: string | number
  debounceDelaySeconds: number
  systemPrompt: string | null
  handoverKeywords: unknown
  workingSetSize: number
  summaryTurnThreshold: number
  embeddingModel: string
  updatedByUserId: string | null
  createdAt: Date
  updatedAt: Date | null
}

/**
 * True when the engine may call OpenAI. Tests skip the key check.
 * Disabled platform AI never requires a key.
 */
export function assertPlatformLlmReady(input: {
  isEnabled: boolean
  nodeEnv: string
  apiKey: string | undefined
}): void {
  if (!input.isEnabled) return
  if (input.nodeEnv === 'test') return
  if (!input.apiKey) {
    throw PlatformAiConfigException.missingApiKey()
  }
}

export default class PlatformAiConfigService {
  #cache: CachedSnapshot | null = null
  #cacheTtlMs: number
  #now: () => number

  constructor(options: PlatformAiConfigServiceOptions = {}) {
    this.#cacheTtlMs = options.cacheTtlMs ?? PLATFORM_AI_CONFIG_CACHE_TTL_MS
    this.#now = options.now ?? Date.now
  }

  async get(): Promise<PlatformAiConfigSnapshot> {
    const now = this.#now()
    if (this.#cache && now < this.#cache.expiresAt) {
      return this.#cache.value
    }

    const value = this.#toSnapshot(await this.#loadRow())
    this.#cache = { value, expiresAt: now + this.#cacheTtlMs }
    return value
  }

  async update(
    patch: UpdatePlatformAiConfigDto,
    actorUserId: string
  ): Promise<PlatformAiConfigSnapshot> {
    const current = this.#toSnapshot(await this.#loadRow())
    const nextWorkingSet = patch.workingSetSize ?? current.workingSetSize
    const nextThreshold = patch.summaryTurnThreshold ?? current.summaryTurnThreshold
    if (nextThreshold < nextWorkingSet) {
      throw PlatformAiConfigException.invalidSummaryThreshold()
    }

    const updates: Record<string, unknown> = { updatedByUserId: actorUserId }
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined) continue
      // node-pg binds JS arrays as Postgres array literals ({a,b}), which is
      // invalid for jsonb. Match other services and send a JSON string.
      updates[key] =
        key === 'handoverKeywords' && Array.isArray(value) ? JSON.stringify(value) : value
    }

    await db
      .from('platform_ai_configs')
      .where('singletonKey', PLATFORM_AI_CONFIG_SINGLETON_KEY)
      .update(updates)

    this.invalidateCache()
    return this.get()
  }

  async assertLlmReady(): Promise<void> {
    const config = await this.get()
    assertPlatformLlmReady({
      isEnabled: config.isEnabled,
      nodeEnv: env.get('NODE_ENV'),
      apiKey: env.get('OPENAI_API_KEY'),
    })
  }

  invalidateCache(): void {
    this.#cache = null
  }

  async #loadRow(): Promise<PlatformAiConfigRow> {
    const row = await db
      .from('platform_ai_configs')
      .where('singletonKey', PLATFORM_AI_CONFIG_SINGLETON_KEY)
      .first()

    if (!row) {
      throw PlatformAiConfigException.notFound()
    }

    return row as PlatformAiConfigRow
  }

  #toSnapshot(row: PlatformAiConfigRow): PlatformAiConfigSnapshot {
    return {
      id: row.id,
      isEnabled: row.isEnabled,
      modelName: row.modelName,
      temperature: Number(row.temperature),
      campaignAttributionWindowHours: Number(row.campaignAttributionWindowHours),
      minConfidenceScore: Number(row.minConfidenceScore),
      debounceDelaySeconds: Number(row.debounceDelaySeconds),
      systemPrompt: row.systemPrompt,
      handoverKeywords: normalizeKeywords(row.handoverKeywords),
      workingSetSize: Number(row.workingSetSize),
      summaryTurnThreshold: Number(row.summaryTurnThreshold),
      embeddingModel: row.embeddingModel,
      updatedByUserId: row.updatedByUserId,
      createdAt: toIso(row.createdAt),
      updatedAt: row.updatedAt ? toIso(row.updatedAt) : null,
    }
  }
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

function normalizeKeywords(value: unknown): string[] {
  if (typeof value === 'string') {
    try {
      return normalizeKeywords(JSON.parse(value))
    } catch {
      return []
    }
  }
  if (Array.isArray(value) && value.every((item) => typeof item === 'string')) {
    return value
  }
  return []
}
