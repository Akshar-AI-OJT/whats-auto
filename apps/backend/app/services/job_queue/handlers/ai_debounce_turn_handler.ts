import logger from '@adonisjs/core/services/logger'
import type { DebounceTurnJobPayload } from '#services/ai/contracts/ai_job_payloads'
import AiDebounceTurnService from '#services/ai/ai_debounce_turn_service'
import type { JobHandler } from '#services/job_queue/contracts/job_queue_driver'

export function createAiDebounceTurnHandler(
  turns: AiDebounceTurnService = new AiDebounceTurnService()
): JobHandler {
  return async (job) => {
    const organizationId =
      typeof job.data.organizationId === 'string' ? job.data.organizationId : null
    const conversationId =
      typeof job.data.conversationId === 'string' ? job.data.conversationId : null
    const contactId = typeof job.data.contactId === 'string' ? job.data.contactId : null

    if (!organizationId || !conversationId || !contactId) {
      logger.warn({ jobId: job.id, data: job.data }, 'ai.debounce_turn.invalid_payload')
      return
    }

    const payload: DebounceTurnJobPayload = {
      organizationId,
      conversationId,
      contactId,
      aggregatedMessages: Array.isArray(job.data.aggregatedMessages)
        ? (job.data.aggregatedMessages as DebounceTurnJobPayload['aggregatedMessages'])
        : [],
    }

    const result = await turns.process(payload)
    logger.info(
      {
        jobId: job.id,
        organizationId,
        conversationId,
        outcome: result.outcome,
        decision: result.decision,
        reason: result.reason,
      },
      'ai.debounce_turn.completed'
    )
  }
}
