import app from '@adonisjs/core/services/app'
import logger from '@adonisjs/core/services/logger'
import { ConversationAiRepository } from '#repositories/conversation_ai_repository'
import { MemoryWorkingSetRepository } from '#repositories/memory_working_set_repository'
import type { SummarizeConversationJobPayload } from '#services/ai/contracts/ai_job_payloads'
import type { MemoryTurn } from '#services/ai/contracts/memory_working_set_service'
import { LlmProvider } from '#services/ai/contracts/llm_provider'
import { MemoryWorkingSetService } from '#services/ai/contracts/memory_working_set_service'
import PlatformAiConfigService from '#services/ai/platform_ai_config_service'
import JobQueueManager from '#services/job_queue/job_queue_manager'
import { JOB_NAMES } from '#services/job_queue/job_names'
import { runWithTenant } from '#services/tenant_context'

export const DEFAULT_SUMMARY_SYSTEM_PROMPT =
  'Summarize this WhatsApp conversation for a future assistant. Keep names, intents, facts, and open questions. Be concise. Do not greet or offer help.'

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
    private llm?: LlmProvider,
    private queue?: JobQueueManager
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
      const driver = await manager.ensureStarted(manager.aiDriverName())
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
    const llm = this.llm ?? (await app.container.make(LlmProvider))
    const completion = await llm.generateCompletion({
      model: config.modelName,
      temperature: config.temperature,
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
