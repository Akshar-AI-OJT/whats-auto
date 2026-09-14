import type { HttpContext } from '@adonisjs/core/http'
import ConversationPolicy from '#policies/conversation_policy'
import { inboxEventsHub } from '#services/inbox_events_hub'
import '#types/http'

/**
 * Server-Sent Events stream for live inbox updates (messages, delivery statuses, AI generation).
 */
export default class InboxEventsController {
  /**
   * @stream
   * @summary Subscribe to inbox realtime events
   * @description SSE stream scoped to the active organization. Emits message.received, message.queued, message.sent, message.failed, status.updated, ai.generation.started, ai.token.delta, ai.generation.completed, ai.handover.triggered, conversation.ai_mode.updated, and periodic ping events.
   * @tag Inbox Events
   * @security BearerAuth
   * @responseBody 200 - text/event-stream
   * @responseBody 403 - { "error": "Permission denied: inbox:view", "code": "PERMISSION_DENIED" }
   */
  async stream({ bouncer, request, response }: HttpContext) {
    await bouncer.with(ConversationPolicy).authorize('viewAny')

    const organizationId = request.activeMember!.organizationId
    const nodeResponse = response.response

    response.header('Content-Type', 'text/event-stream')
    response.header('Cache-Control', 'no-cache, no-transform')
    response.header('Connection', 'keep-alive')
    response.header('X-Accel-Buffering', 'no')

    // Flush headers immediately and keep the socket open.
    response.status(200)
    nodeResponse.flushHeaders?.()

    const write = (chunk: string) => {
      if (!nodeResponse.writableEnded) {
        nodeResponse.write(chunk)
      }
    }

    const close = () => {
      try {
        nodeResponse.end()
      } catch {
        // already closed
      }
    }

    const unsubscribe = inboxEventsHub.subscribe({
      organizationId,
      write,
      close,
    })

    write(
      `event: ping\ndata: ${JSON.stringify({ type: 'ping', at: new Date().toISOString() })}\n\n`
    )

    const heartbeat = setInterval(() => {
      try {
        write(
          `event: ping\ndata: ${JSON.stringify({ type: 'ping', at: new Date().toISOString() })}\n\n`
        )
      } catch {
        clearInterval(heartbeat)
        unsubscribe()
      }
    }, 25000)

    const onClose = () => {
      clearInterval(heartbeat)
      unsubscribe()
    }

    request.request.on('close', onClose)
    request.request.on('error', onClose)

    // Prevent Adonis from ending the response after the controller returns.
    response.response.on('close', onClose)

    await new Promise<void>((resolve) => {
      request.request.once('close', () => resolve())
      request.request.once('error', () => resolve())
    })
  }
}
