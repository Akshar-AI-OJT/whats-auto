import db from '@adonisjs/lucid/services/db'
import app from '@adonisjs/core/services/app'
import env from '#start/env'
import {
  LlmChatProvider,
  LLM_CHAT_PROVIDERS,
  LLM_PROVIDER_API_KEY_ENV,
} from '#enums/llm_chat_provider'
import PlatformAiConfigException from '#exceptions/platform_ai_config_exception'
import { insertAuthorizationAudit } from '#lib/authorization_audit'
import { DEFAULT_EMBEDDING_SPACE_ID, buildEmbeddingSpaceId } from '#services/ai/embedding_space'
import {
  catalogForProvider,
  isAllowedChatModel,
  isAllowedEmbeddingModel,
} from '#services/ai/platform_ai_models'
import JobQueueManager from '#services/job_queue/job_queue_manager'
import { JOB_NAMES, PLATFORM_AI_REINDEX_SINGLETON_KEY } from '#services/job_queue/job_names'

export const PLATFORM_AI_CONFIG_CACHE_TTL_MS = 30_000
export const PLATFORM_AI_CONFIG_SINGLETON_KEY = 'default'

export type PlatformAiReindexStatus = 'idle' | 'running' | 'failed'

export type PlatformAiConfigSnapshot = {
  id: string
  isEnabled: boolean
  chatProvider: LlmChatProvider
  chatModel: string
  summaryModel: string | null
  modelName: string
  temperature: number
  campaignAttributionWindowHours: number
  minConfidenceScore: number
  debounceDelaySeconds: number
  systemPrompt: string | null
  workingSetSize: number
  summaryTurnThreshold: number
  embeddingProvider: LlmChatProvider
  embeddingModel: string
  activeEmbeddingSpaceId: string
  maxOutputTokens: number
  reindexStatus: PlatformAiReindexStatus
  reindexFromSpaceId: string | null
  reindexToSpaceId: string | null
  reindexEmbeddingModel: string | null
  reindexEmbeddingProvider: LlmChatProvider | null
  updatedByUserId: string | null
  createdAt: string
  updatedAt: string | null
}

export type UpdatePlatformAiConfigDto = {
  isEnabled?: boolean
  chatProvider?: LlmChatProvider
  chatModel?: string
  summaryModel?: string | null
  modelName?: string
  temperature?: number
  campaignAttributionWindowHours?: number
  minConfidenceScore?: number
  debounceDelaySeconds?: number
  systemPrompt?: string | null
  workingSetSize?: number
  summaryTurnThreshold?: number
  embeddingProvider?: LlmChatProvider
  embeddingModel?: string
  activeEmbeddingSpaceId?: string
  maxOutputTokens?: number
  confirmReindex?: boolean
}

export type PlatformAiConfigServiceOptions = {
  cacheTtlMs?: number
  now?: () => number
  countChunksInSpace?: (spaceId: string) => Promise<number>
  deleteChunksInSpace?: (spaceId: string) => Promise<number>
  enqueueReindex?: () => Promise<void>
}

type CachedSnapshot = {
  value: PlatformAiConfigSnapshot
  expiresAt: number
}

type PlatformAiConfigRow = {
  id: string
  isEnabled: boolean
  chatProvider: string
  chatModel: string
  summaryModel: string | null
  modelName: string
  temperature: string | number
  campaignAttributionWindowHours: number
  minConfidenceScore: string | number
  debounceDelaySeconds: number
  systemPrompt: string | null
  workingSetSize: number
  summaryTurnThreshold: number
  embeddingProvider: string
  embeddingModel: string
  activeEmbeddingSpaceId: string
  maxOutputTokens: number
  reindexStatus: string
  reindexFromSpaceId: string | null
  reindexToSpaceId: string | null
  reindexEmbeddingModel: string | null
  reindexEmbeddingProvider: string | null
  updatedByUserId: string | null
  createdAt: Date
  updatedAt: Date | null
}

/**
 * True when the engine may call the selected provider. Tests skip the key check.
 * Disabled platform AI never requires a key.
 */
export function assertPlatformLlmReady(input: {
  isEnabled: boolean
  nodeEnv: string
  chatProvider: LlmChatProvider
  apiKey: string | undefined
}): void {
  if (!input.isEnabled) return
  if (input.nodeEnv === 'test') return
  if (!input.apiKey) {
    throw PlatformAiConfigException.missingApiKey(LLM_PROVIDER_API_KEY_ENV[input.chatProvider])
  }
}

export default class PlatformAiConfigService {
  #cache: CachedSnapshot | null = null
  #cacheTtlMs: number
  #now: () => number
  #countChunksInSpace: ((spaceId: string) => Promise<number>) | undefined
  #deleteChunksInSpace: ((spaceId: string) => Promise<number>) | undefined
  #enqueueReindexFn: (() => Promise<void>) | undefined

  constructor(options: PlatformAiConfigServiceOptions = {}) {
    this.#cacheTtlMs = options.cacheTtlMs ?? PLATFORM_AI_CONFIG_CACHE_TTL_MS
    this.#now = options.now ?? Date.now
    this.#countChunksInSpace = options.countChunksInSpace
    this.#deleteChunksInSpace = options.deleteChunksInSpace
    this.#enqueueReindexFn = options.enqueueReindex
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
    const { confirmReindex, ...fields } = patch
    const current = this.#toSnapshot(await this.#loadRow())
    const nextWorkingSet = fields.workingSetSize ?? current.workingSetSize
    const nextThreshold = fields.summaryTurnThreshold ?? current.summaryTurnThreshold
    if (nextThreshold < nextWorkingSet) {
      throw PlatformAiConfigException.invalidSummaryThreshold()
    }

    const nextChatProvider = fields.chatProvider ?? current.chatProvider
    const nextEmbeddingProvider = fields.embeddingProvider ?? nextChatProvider
    if (nextEmbeddingProvider !== nextChatProvider) {
      throw PlatformAiConfigException.embeddingProviderMismatch()
    }

    const resolved = resolveModelPatch(current, fields, nextChatProvider)
    assertResolvedModels(resolved, nextChatProvider)

    const reindexPending = current.reindexStatus === 'running' || current.reindexStatus === 'failed'
    const patchChangesProvider =
      fields.chatProvider !== undefined && fields.chatProvider !== current.chatProvider
    const omitEmbedFromPatch = fields.embeddingModel === undefined && !patchChangesProvider
    const nextSpace = buildEmbeddingSpaceId(nextChatProvider, resolved.embeddingModel)
    const targetingPending = reindexPending && current.reindexToSpaceId === nextSpace
    const revertingPending =
      reindexPending && nextSpace === current.activeEmbeddingSpaceId && !confirmReindex
    const embedIdentityChanged =
      !omitEmbedFromPatch && nextSpace !== current.activeEmbeddingSpaceId && !targetingPending

    if (current.reindexStatus === 'running' && embedIdentityChanged) {
      throw PlatformAiConfigException.reindexInProgress()
    }

    let startReindex =
      targetingPending && Boolean(confirmReindex) && current.reindexStatus === 'failed'
    if (embedIdentityChanged) {
      const chunkCount = await this.#chunksInSpace(current.activeEmbeddingSpaceId)
      if (chunkCount > 0) {
        if (!confirmReindex) {
          throw PlatformAiConfigException.reindexRequired(chunkCount)
        }
        startReindex = true
      }
    }

    const skipLiveEmbed = startReindex || (reindexPending && !revertingPending)
    if (startReindex && current.reindexToSpaceId && current.reindexToSpaceId !== nextSpace) {
      await this.#gcSpace(current.reindexToSpaceId)
    }

    const writes: UpdatePlatformAiConfigDto = { ...fields }
    if (resolved.writeChatModel) {
      writes.chatModel = resolved.chatModel
      writes.modelName = resolved.chatModel
    }
    if (resolved.writeSummaryModel) writes.summaryModel = resolved.summaryModel
    if (resolved.writeEmbeddingModel && !skipLiveEmbed) {
      writes.embeddingModel = resolved.embeddingModel
    } else {
      delete writes.embeddingModel
    }
    if (fields.chatProvider !== undefined) writes.chatProvider = nextChatProvider

    const dualWrite = applyDualReadWrites(writes)
    const updates: Record<string, unknown> = {
      updatedByUserId: actorUserId,
    }
    if (!skipLiveEmbed) {
      updates.embeddingProvider = nextChatProvider
    }
    for (const [key, value] of Object.entries({ ...writes, ...dualWrite })) {
      if (value === undefined) continue
      if (
        key === 'embeddingProvider' ||
        key === 'activeEmbeddingSpaceId' ||
        key === 'confirmReindex'
      ) {
        continue
      }
      if (skipLiveEmbed && key === 'embeddingModel') continue
      updates[key] = value
    }
    if (embedIdentityChanged && !skipLiveEmbed) {
      updates.activeEmbeddingSpaceId = nextSpace
      Object.assign(updates, idleReindexColumns())
    }
    if (startReindex) {
      updates.reindexStatus = 'running'
      updates.reindexFromSpaceId = current.activeEmbeddingSpaceId
      updates.reindexToSpaceId = nextSpace
      updates.reindexEmbeddingModel = resolved.embeddingModel
      updates.reindexEmbeddingProvider = nextChatProvider
    } else if (revertingPending) {
      Object.assign(updates, idleReindexColumns())
    }

    await db
      .from('platform_ai_configs')
      .where('singletonKey', PLATFORM_AI_CONFIG_SINGLETON_KEY)
      .update(updates)

    this.invalidateCache()

    if (startReindex) {
      try {
        await this.#enqueueReindex()
      } catch (error) {
        await this.markReindexFailed()
        throw error
      }
    }

    const snapshot = await this.get()
    await insertAuthorizationAudit({
      organizationId: null,
      actorUserId,
      targetType: 'ai_config',
      targetId: snapshot.id,
      eventType: 'ai_config.updated',
      after: {
        chatProvider: snapshot.chatProvider,
        chatModel: snapshot.chatModel,
        isEnabled: snapshot.isEnabled,
      },
    })
    return snapshot
  }

  async completeReindex(): Promise<{ fromSpaceId: string; toSpaceId: string }> {
    const current = this.#toSnapshot(await this.#loadRow())
    if (
      current.reindexStatus !== 'running' ||
      !current.reindexFromSpaceId ||
      !current.reindexToSpaceId ||
      !current.reindexEmbeddingModel ||
      !current.reindexEmbeddingProvider
    ) {
      throw new Error('No running knowledge reindex to complete')
    }

    await db
      .from('platform_ai_configs')
      .where('singletonKey', PLATFORM_AI_CONFIG_SINGLETON_KEY)
      .update({
        embeddingProvider: current.reindexEmbeddingProvider,
        embeddingModel: current.reindexEmbeddingModel,
        activeEmbeddingSpaceId: current.reindexToSpaceId,
        ...idleReindexColumns(),
      })

    this.invalidateCache()
    return { fromSpaceId: current.reindexFromSpaceId, toSpaceId: current.reindexToSpaceId }
  }

  async markReindexFailed(): Promise<void> {
    await db
      .from('platform_ai_configs')
      .where('singletonKey', PLATFORM_AI_CONFIG_SINGLETON_KEY)
      .where('reindexStatus', 'running')
      .update({ reindexStatus: 'failed' })
    this.invalidateCache()
  }

  async assertLlmReady(): Promise<void> {
    const config = await this.get()
    assertPlatformLlmReady({
      isEnabled: config.isEnabled,
      nodeEnv: env.get('NODE_ENV'),
      chatProvider: config.chatProvider,
      apiKey: apiKeyForProvider(config.chatProvider),
    })
  }

  invalidateCache(): void {
    this.#cache = null
  }

  async #chunksInSpace(spaceId: string): Promise<number> {
    if (this.#countChunksInSpace) return this.#countChunksInSpace(spaceId)
    const result = await db.rawQuery('SELECT count_ai_knowledge_chunks_in_space(?) AS total', [
      spaceId,
    ])
    const rows = (result.rows ?? result) as Array<{ total: string | number }>
    return Number(rows[0]?.total ?? 0)
  }

  async #gcSpace(spaceId: string): Promise<number> {
    if (this.#deleteChunksInSpace) return this.#deleteChunksInSpace(spaceId)
    const result = await db.rawQuery('SELECT delete_ai_knowledge_chunks_in_space(?) AS total', [
      spaceId,
    ])
    const rows = (result.rows ?? result) as Array<{ total: string | number }>
    return Number(rows[0]?.total ?? 0)
  }

  async #enqueueReindex(): Promise<void> {
    if (this.#enqueueReindexFn) {
      await this.#enqueueReindexFn()
      return
    }
    const manager = await app.container.make(JobQueueManager)
    const queue = await manager.ensureStarted()
    await queue.enqueue(
      JOB_NAMES.AI_REINDEX_ALL_DOCUMENTS,
      {},
      {
        singletonKey: PLATFORM_AI_REINDEX_SINGLETON_KEY,
      }
    )
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
    const chatModel = row.chatModel || row.modelName
    const chatProvider = parseProvider(row.chatProvider)
    const embeddingProvider = parseProvider(row.embeddingProvider || row.chatProvider)
    return {
      id: row.id,
      isEnabled: row.isEnabled,
      chatProvider,
      chatModel,
      summaryModel: row.summaryModel ?? null,
      modelName: chatModel,
      temperature: Number(row.temperature),
      campaignAttributionWindowHours: Number(row.campaignAttributionWindowHours),
      minConfidenceScore: Number(row.minConfidenceScore),
      debounceDelaySeconds: Number(row.debounceDelaySeconds),
      systemPrompt: row.systemPrompt,
      workingSetSize: Number(row.workingSetSize),
      summaryTurnThreshold: Number(row.summaryTurnThreshold),
      embeddingProvider,
      embeddingModel: row.embeddingModel,
      activeEmbeddingSpaceId: row.activeEmbeddingSpaceId || DEFAULT_EMBEDDING_SPACE_ID,
      maxOutputTokens: Number(row.maxOutputTokens ?? 1024),
      reindexStatus: parseReindexStatus(row.reindexStatus),
      reindexFromSpaceId: row.reindexFromSpaceId ?? null,
      reindexToSpaceId: row.reindexToSpaceId ?? null,
      reindexEmbeddingModel: row.reindexEmbeddingModel ?? null,
      reindexEmbeddingProvider: row.reindexEmbeddingProvider
        ? parseProvider(row.reindexEmbeddingProvider)
        : null,
      updatedByUserId: row.updatedByUserId,
      createdAt: toIso(row.createdAt),
      updatedAt: row.updatedAt ? toIso(row.updatedAt) : null,
    }
  }
}

function idleReindexColumns(): Record<string, unknown> {
  return {
    reindexStatus: 'idle',
    reindexFromSpaceId: null,
    reindexToSpaceId: null,
    reindexEmbeddingModel: null,
    reindexEmbeddingProvider: null,
  }
}

function parseReindexStatus(value: string | null | undefined): PlatformAiReindexStatus {
  if (value === 'running' || value === 'failed') return value
  return 'idle'
}

function applyDualReadWrites(patch: UpdatePlatformAiConfigDto): UpdatePlatformAiConfigDto {
  const extra: UpdatePlatformAiConfigDto = {}
  if (patch.chatModel !== undefined && patch.modelName === undefined) {
    extra.modelName = patch.chatModel
  }
  if (patch.modelName !== undefined && patch.chatModel === undefined) {
    extra.chatModel = patch.modelName
  }
  return extra
}

type ResolvedModelPatch = {
  chatModel: string
  summaryModel: string | null
  embeddingModel: string
  writeChatModel: boolean
  writeSummaryModel: boolean
  writeEmbeddingModel: boolean
}

function resolveModelPatch(
  current: PlatformAiConfigSnapshot,
  patch: UpdatePlatformAiConfigDto,
  nextChatProvider: LlmChatProvider
): ResolvedModelPatch {
  const providerChanged = nextChatProvider !== current.chatProvider
  const defaults = catalogForProvider(nextChatProvider).defaults
  const chatInPatch = patch.chatModel !== undefined || patch.modelName !== undefined
  const summaryInPatch = patch.summaryModel !== undefined
  const embeddingInPatch = patch.embeddingModel !== undefined

  return {
    chatModel: chatInPatch
      ? (patch.chatModel ?? patch.modelName ?? current.chatModel)
      : providerChanged
        ? defaults.chatModel
        : current.chatModel,
    summaryModel: summaryInPatch
      ? patch.summaryModel!
      : providerChanged
        ? defaults.summaryModel
        : current.summaryModel,
    embeddingModel: embeddingInPatch
      ? patch.embeddingModel!
      : providerChanged
        ? defaults.embeddingModel
        : current.embeddingModel,
    writeChatModel: chatInPatch || providerChanged,
    writeSummaryModel: summaryInPatch || providerChanged,
    writeEmbeddingModel: embeddingInPatch || providerChanged,
  }
}

function assertResolvedModels(resolved: ResolvedModelPatch, provider: LlmChatProvider): void {
  if (resolved.writeChatModel && !isAllowedChatModel(provider, resolved.chatModel)) {
    throw PlatformAiConfigException.invalidModel('chatModel', resolved.chatModel, provider)
  }
  if (
    resolved.writeSummaryModel &&
    resolved.summaryModel &&
    !isAllowedChatModel(provider, resolved.summaryModel)
  ) {
    throw PlatformAiConfigException.invalidModel('summaryModel', resolved.summaryModel, provider)
  }
  if (resolved.writeEmbeddingModel && !isAllowedEmbeddingModel(provider, resolved.embeddingModel)) {
    throw PlatformAiConfigException.invalidModel(
      'embeddingModel',
      resolved.embeddingModel,
      provider
    )
  }
}

function parseProvider(value: string): LlmChatProvider {
  if ((LLM_CHAT_PROVIDERS as string[]).includes(value)) {
    return value as LlmChatProvider
  }
  return LlmChatProvider.Openai
}

function apiKeyForProvider(provider: LlmChatProvider): string | undefined {
  const value =
    provider === LlmChatProvider.Google
      ? env.get('GOOGLE_AI_API_KEY')
      : provider === LlmChatProvider.Mistral
        ? env.get('MISTRAL_API_KEY')
        : env.get('OPENAI_API_KEY')
  return value?.release()
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}
