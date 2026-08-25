import logger from '@adonisjs/core/services/logger'
import type { FlowAdvanceSessionJobPayload } from '#services/flow/contracts/flow_job_payloads'
import FlowExecutionEngine from '#services/flow/flow_execution_engine'
import FlowInboundBufferService from '#services/flow/flow_inbound_buffer_service'
import type { JobHandler } from '#services/job_queue/contracts/job_queue_driver'

export function createFlowsAdvanceSessionHandler(
  engine: FlowExecutionEngine = new FlowExecutionEngine(),
  buffer: FlowInboundBufferService = new FlowInboundBufferService()
): JobHandler {
  return async (job) => {
    const payload = parsePayload(job.data)
    if (!payload) {
      logger.warn({ jobId: job.id, data: job.data }, 'flows.advance_session.invalid_payload')
      return
    }

    const advancePayload = await mergeBufferedText(payload, buffer)
    const result = await engine.advance(advancePayload)
    logger.info(
      {
        jobId: job.id,
        organizationId: payload.organizationId,
        conversationId: payload.conversationId,
        sessionId: result?.sessionId,
        status: result?.status,
        steps: result?.steps,
      },
      'flows.advance_session.completed'
    )
  }
}

async function mergeBufferedText(
  payload: FlowAdvanceSessionJobPayload,
  buffer: FlowInboundBufferService
): Promise<FlowAdvanceSessionJobPayload> {
  // Interactive taps skip the buffer; do not merge leftover free text into them.
  if (payload.interactiveReplyId) return payload

  const entries = await buffer.drain({
    organizationId: payload.organizationId,
    conversationId: payload.conversationId,
  })
  if (entries.length === 0) return payload

  return {
    ...payload,
    contentText: entries.map((entry) => entry.content).join('\n'),
  }
}

function parsePayload(data: Record<string, unknown>): FlowAdvanceSessionJobPayload | null {
  const organizationId = typeof data.organizationId === 'string' ? data.organizationId : null
  const conversationId = typeof data.conversationId === 'string' ? data.conversationId : null
  const contactId = typeof data.contactId === 'string' ? data.contactId : null
  const messageId = typeof data.messageId === 'string' ? data.messageId : null
  if (!organizationId || !conversationId || !contactId || !messageId) return null

  const contentText = typeof data.contentText === 'string' ? data.contentText : null
  const interactiveReplyId =
    typeof data.interactiveReplyId === 'string' ? data.interactiveReplyId : null

  const intentRaw = data.intent
  if (!intentRaw || typeof intentRaw !== 'object' || Array.isArray(intentRaw)) return null
  const intent = intentRaw as Record<string, unknown>
  const type = intent.type

  if (type === 'resume') {
    const sessionId = typeof intent.sessionId === 'string' ? intent.sessionId : null
    if (!sessionId) return null
    return {
      organizationId,
      conversationId,
      contactId,
      messageId,
      contentText,
      interactiveReplyId,
      intent: { type: 'resume', sessionId },
    }
  }

  if (type === 'start') {
    const flowId = typeof intent.flowId === 'string' ? intent.flowId : null
    const flowVersionId = typeof intent.flowVersionId === 'string' ? intent.flowVersionId : null
    if (!flowId || !flowVersionId) return null
    return {
      organizationId,
      conversationId,
      contactId,
      messageId,
      contentText,
      interactiveReplyId,
      intent: { type: 'start', flowId, flowVersionId },
    }
  }

  return null
}
