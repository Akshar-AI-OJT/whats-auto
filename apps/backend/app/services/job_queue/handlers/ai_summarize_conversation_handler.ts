import logger from '@adonisjs/core/services/logger'
import type { SummarizeConversationJobPayload } from '#services/ai/contracts/ai_job_payloads'
import AiConversationSummaryService from '#services/ai/ai_conversation_summary_service'
import type { JobHandler } from '#services/job_queue/contracts/job_queue_driver'

const TRIGGER_REASONS = new Set<SummarizeConversationJobPayload['triggerReason']>([
  'turn_count_threshold',
  'inactivity_window',
])

export function createAiSummarizeConversationHandler(
  summaries: AiConversationSummaryService = new AiConversationSummaryService()
): JobHandler {
  return async (job) => {
    const organizationId =
      typeof job.data.organizationId === 'string' ? job.data.organizationId : null
    const conversationId =
      typeof job.data.conversationId === 'string' ? job.data.conversationId : null
    const rawReason = job.data.triggerReason
    const triggerReason =
      typeof rawReason === 'string' &&
      TRIGGER_REASONS.has(rawReason as SummarizeConversationJobPayload['triggerReason'])
        ? (rawReason as SummarizeConversationJobPayload['triggerReason'])
        : null

    if (!organizationId || !conversationId || !triggerReason) {
      logger.warn({ jobId: job.id, data: job.data }, 'ai.summarize_conversation.invalid_payload')
      return
    }

    const result = await summaries.process({
      organizationId,
      conversationId,
      triggerReason,
    })
    logger.info(
      {
        jobId: job.id,
        organizationId,
        conversationId,
        triggerReason,
        outcome: result.outcome,
        reason: result.reason,
      },
      'ai.summarize_conversation.completed'
    )
  }
}
