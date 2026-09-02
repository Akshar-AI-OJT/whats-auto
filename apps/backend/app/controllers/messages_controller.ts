import { Exception } from '@adonisjs/core/exceptions'
import type { HttpContext } from '@adonisjs/core/http'
import MessagePolicy from '#policies/message_policy'
import { MessageService } from '#services/message_service'
import { conversationIdParamValidator } from '#validators/conversation'
import { createMessageValidator, listMessagesValidator } from '#validators/message'
import '#types/http'

export default class MessagesController {
  /**
   * @index
   * @summary List conversation messages
   * @description Paginated message thread for a conversation, ordered chronologically (createdAt ASC).
   * @tag Inbox Messages
   * @security BearerAuth
   * @paramPath id - Conversation id - @type(string)
   * @paramQuery page - Page number (default 1) - @type(number)
   * @paramQuery limit - Items per page (1-100, default 20) - @type(number)
   * @paramQuery after - ISO timestamp; only messages created after this time - @type(string)
   * @responseBody 200 - { "data": [{ "id": "uuid", "direction": "outbound", "contentType": "text", "contentText": "Hello!", "status": "sent", "sender": { "type": "agent", "id": "uuid", "name": "Ada" }, "createdAt": "2026-08-04T12:00:00.000Z" }], "meta": { "total": 1, "perPage": 20, "currentPage": 1, "lastPage": 1 } }
   * @responseBody 404 - { "error": "Conversation not found", "code": "E_CONVERSATION_NOT_FOUND" }
   * @responseBody 403 - { "error": "Permission denied: inbox:view", "code": "PERMISSION_DENIED" }
   */
  async index({ bouncer, request, params, serialize }: HttpContext) {
    const { id } = await request.validateUsing(conversationIdParamValidator, {
      data: params,
    })

    await bouncer.with(MessagePolicy).authorize('viewList', {
      organizationId: request.activeMember!.organizationId,
      id,
    })

    const qs = await request.validateUsing(listMessagesValidator, {
      data: request.qs(),
    })

    const result = await new MessageService().listMessagesPaginated({
      organizationId: request.activeMember!.organizationId,
      conversationId: id,
      page: qs.page,
      limit: qs.limit,
      after: qs.after,
    })

    return serialize(result)
  }

  /**
   * @store
   * @summary Send an agent reply
   * @description Queues an outbound agent message (text, media, or template) for async WhatsApp delivery. Requires the Idempotency-Key header.
   * @tag Inbox Messages
   * @security BearerAuth
   * @paramPath id - Conversation id - @type(string)
   * @paramHeader Idempotency-Key - Client idempotency key (required, non-empty) - @type(string)
   * @requestBody { "contentType": "text", "contentText": "Hello!" }
   * @responseBody 200 - { "data": { "id": "uuid", "direction": "outbound", "senderType": "agent", "contentType": "text", "contentText": "Hello!", "status": "queued" } }
   * @responseBody 404 - { "error": "Conversation not found", "code": "E_CONVERSATION_NOT_FOUND" }
   * @responseBody 422 - { "error": "Customer service window has expired", "code": "E_OUTBOUND_SESSION_WINDOW_EXPIRED" }
   * @responseBody 422 - { "error": "Cannot reply to a closed conversation", "code": "E_OUTBOUND_CONVERSATION_CLOSED" }
   * @responseBody 422 - { "error": "Media asset MIME type is not supported for WhatsApp delivery", "code": "E_OUTBOUND_MEDIA_MIME_TYPE" }
   * @responseBody 422 - { "error": "Media asset does not have a publicly accessible URL for WhatsApp delivery", "code": "E_OUTBOUND_MEDIA_LINK_UNAVAILABLE" }
   * @responseBody 422 - { "error": "Idempotency-Key was reused with a different payload", "code": "E_IDEMPOTENCY_KEY_CONFLICT" }
   * @responseBody 422 - { "error": "Idempotency-Key header is required", "code": "E_IDEMPOTENCY_KEY_REQUIRED" }
   * @responseBody 403 - { "error": "Permission denied: inbox:reply", "code": "PERMISSION_DENIED" }
   */
  async store({ bouncer, request, params, serialize }: HttpContext) {
    const { id } = await request.validateUsing(conversationIdParamValidator, {
      data: params,
    })

    await bouncer.with(MessagePolicy).authorize('send', {
      organizationId: request.activeMember!.organizationId,
      id,
    })

    const payload = await request.validateUsing(createMessageValidator)
    const idempotencyKey = this.requireIdempotencyKey(request)

    const message = await new MessageService().sendAgentReply({
      organizationId: request.activeMember!.organizationId,
      conversationId: id,
      senderId: request.authUser!.id,
      contentType: payload.contentType,
      contentText: payload.contentText,
      mediaAssetId: payload.mediaAssetId,
      templateId: payload.templateId,
      templateParameters: payload.templateParameters,
      headerMediaAssetId: payload.headerMediaAssetId,
      idempotencyKey,
    })

    return serialize(message)
  }

  private requireIdempotencyKey(request: HttpContext['request']): string {
    const key = request.header('Idempotency-Key')?.trim()
    if (!key) {
      throw new Exception('Idempotency-Key header is required', {
        status: 422,
        code: 'E_IDEMPOTENCY_KEY_REQUIRED',
      })
    }
    return key
  }
}
