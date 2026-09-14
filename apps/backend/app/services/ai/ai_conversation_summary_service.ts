import app from '@adonisjs/core/services/app'
import logger from '@adonisjs/core/services/logger'
import { AiUsageDecision } from '#enums/ai_usage_decision'
import { AiUsageLogRepository } from '#repositories/ai_usage_log_repository'
import { ConversationAiRepository } from '#repositories/conversation_ai_repository'
import { MemoryWorkingSetRepository } from '#repositories/memory_working_set_repository'
import type { SummarizeConversationJobPayload } from '#services/ai/contracts/ai_job_payloads'
import type { MemoryTurn } from '#services/ai/contracts/memory_working_set_service'
import { ChatLlmProvider } from '#services/ai/contracts/llm_provider'
import { MemoryWorkingSetService } from '#services/ai/contracts/memory_working_set_service'
import PlatformAiConfigService from '#services/ai/platform_ai_config_service'
import { AiQuotaService } from '#services/billing/ai_quota_service'
import JobQueueManager from '#services/job_queue/job_queue_manager'
import { JOB_NAMES } from '#services/job_queue/job_names'
import { runWithTenant } from '#services/tenant_context'

export const DEFAULT_SUMMARY_SYSTEM_PROMPT =
  'Summarize this WhatsApp conversation for a future assistant. Keep names, intents, facts, and open questions. Be concise. Do not greet or offer help.'

export const SUMMARY_COMPLETION_TEMPERATURE = 0.1

export type ScheduleSummaryInput = {
  organizationId: string
  conversationId: string
}

export type SummarizeResult = {
  outcome: 'skipped' | 'updated'
  reason?: string
}

export default class AiConversationSummaryService {
  constructor(
    private platform: PlatformAiConfigService = new PlatformAiConfigService(),
    private conversations: ConversationAiRepository = new ConversationAiRepository(),
    private turns: MemoryWorkingSetRepository = new MemoryWorkingSetRepository(),
    private memory?: MemoryWorkingSetService,
    private llm?: ChatLlmProvider,
    private queue?: JobQueueManager,
    private usage: AiUsageLogRepository = new AiUsageLogRepository(),
    private aiQuota: AiQuotaService = new AiQuotaService()
  ) {}

  async scheduleAfterAutoReply(input: ScheduleSummaryInput): Promise<void> {
    try {
      const config = await this.platform.get()
      if (!config.isEnabled) return

      const count = await runWithTenant(input.organizationId, () =>
        this.turns.countTurns({
          organizationId: input.organizationId,
          conversationId: input.conversationId,
        })
      )
      if (count <= config.summaryTurnThreshold) return

      const manager = this.queue ?? (await app.container.make(JobQueueManager))
      const driver = await manager.ensureStarted()
      const payload: SummarizeConversationJobPayload = {
        organizationId: input.organizationId,
        conversationId: input.conversationId,
        triggerReason: 'turn_count_threshold',
      }
      await driver.enqueue(
        JOB_NAMES.AI_SUMMARIZE_CONVERSATION,
        { ...payload },
        {
          singletonKey: input.conversationId,
        }
      )
    } catch (error) {
      logger.warn(
        {
          organizationId: input.organizationId,
          conversationId: input.conversationId,
          err: error instanceof Error ? error.message : 'unknown',
        },
        'ai.summarize.enqueue_failed'
      )
    }
  }

  async process(payload: SummarizeConversationJobPayload): Promise<SummarizeResult> {
    try {
      return await runWithTenant(payload.organizationId, () => this.#process(payload))
    } catch (error) {
      logger.warn(
        {
          organizationId: payload.organizationId,
          conversationId: payload.conversationId,
          err: error instanceof Error ? error.message : 'unknown',
        },
        'ai.summarize.failed'
      )
      return { outcome: 'skipped', reason: 'error' }
    }
  }

  async #process(payload: SummarizeConversationJobPayload): Promise<SummarizeResult> {
    const config = await this.platform.get()
    if (!config.isEnabled) return { outcome: 'skipped', reason: 'disabled' }

    const quota = await this.aiQuota.peek(payload.organizationId)
    if (!quota.allowed) {
      await this.aiQuota.notifyExceeded(payload.organizationId)
      return { outcome: 'skipped', reason: 'quota_exceeded' }
    }

    const conversation = await this.conversations.findById({
      organizationId: payload.organizationId,
      conversationId: payload.conversationId,
    })
    if (!conversation) return { outcome: 'skipped', reason: 'missing_conversation' }

    const memory = this.memory ?? (await app.container.make(MemoryWorkingSetService))
    const recent = await memory.getRecentTurns(payload.organizationId, payload.conversationId)
    const previous = conversation.aiSummary?.trim() || null
    if (recent.length === 0 && !previous) return { outcome: 'skipped', reason: 'empty' }

    if (!this.llm) await this.platform.assertLlmReady()
    const llm = this.llm ?? (await app.container.make(ChatLlmProvider))
    const completion = await llm.generateCompletion({
      model: config.summaryModel ?? config.chatModel,
      temperature: SUMMARY_COMPLETION_TEMPERATURE,
      maxTokens: config.maxOutputTokens,
      systemPrompt: DEFAULT_SUMMARY_SYSTEM_PROMPT,
      userPrompt: buildSummaryPrompt({ previous, turns: recent }),
    })

    const summary = completion.text.trim()
    if (!summary) return { outcome: 'skipped', reason: 'empty_completion' }

    await this.conversations.updateAiSummary({
      organizationId: payload.organizationId,
      conversationId: payload.conversationId,
      summary,
    })

    try {
      await this.usage.insert({
        organizationId: payload.organizationId,
        conversationId: payload.conversationId,
        provider: config.chatProvider,
        operationType: 'conversation_summary',
        promptTokens: completion.promptTokens,
        completionTokens: completion.completionTokens,
        totalTokens: completion.totalTokens,
        modelName: completion.modelName,
        latencyMs: completion.latencyMs,
        decision: AiUsageDecision.CONVERSATION_SUMMARY,
      })
      await this.aiQuota.incrementOnSuccess(payload.organizationId)
    } catch (error) {
      logger.warn(
        {
          organizationId: payload.organizationId,
          conversationId: payload.conversationId,
          err: error instanceof Error ? error.message : 'unknown',
        },
        'ai.summarize.usage_log_failed'
      )
    }

    return { outcome: 'updated' }
  }
}

function buildSummaryPrompt(params: { previous: string | null; turns: MemoryTurn[] }): string {
  const lines: string[] = ['Previous summary:', params.previous ?? '(none)', '']
  if (params.turns.length > 0) {
    lines.push('Recent turns:')
    for (const turn of params.turns) {
      lines.push(`${turn.role}: ${turn.content}`)
    }
  }
  return lines.join('\n')
}
