import type { HttpContext } from '@adonisjs/core/http'
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
   * @responseBody 200 - { "data": [{ "id": "uuid", "direction": "outbound", "contentType": "text", "contentText": "Hello!", "status": "sent", "sender": { "type": "agent", "id": "uuid", "name": "Ada" }, "createdAt": "2026-08-04T12:00:00.000Z" }], "meta": { "total": 1, "perPage": 20, "currentPage": 1, "lastPage": 1 } }
   * @responseBody 404 - { "error": "Conversation not found", "code": "E_CONVERSATION_NOT_FOUND" }
   * @responseBody 403 - { "error": "Permission denied: inbox:view", "code": "PERMISSION_DENIED" }
   */
  async index({ request, params, serialize }: HttpContext) {
    const { id } = await request.validateUsing(conversationIdParamValidator, {
      data: params,
    })
    const qs = await request.validateUsing(listMessagesValidator, {
      data: request.qs(),
    })

    const result = await new MessageService().listMessagesPaginated({
      organizationId: request.activeMember!.organizationId,
      conversationId: id,
      page: qs.page,
      limit: qs.limit,
    })

    return serialize(result)
  }

  /**
   * @store
   * @summary Send an agent reply
   * @description Creates an outbound agent message and dispatches it via the Meta WhatsApp Cloud API.
   * @tag Inbox Messages
   * @security BearerAuth
   * @paramPath id - Conversation id - @type(string)
   * @requestBody { "contentType": "text", "contentText": "Hello!" }
   * @responseBody 200 - { "data": { "id": "uuid", "direction": "outbound", "senderType": "agent", "contentType": "text", "contentText": "Hello!", "status": "sent" } }
   * @responseBody 404 - { "error": "Conversation not found", "code": "E_CONVERSATION_NOT_FOUND" }
   * @responseBody 422 - { "error": "Cannot reply to a closed conversation", "code": "E_CONVERSATION_CLOSED" }
   * @responseBody 502 - { "error": "Meta Graph send failed", "code": "E_MESSAGE_META_GRAPH_FAILED" }
   * @responseBody 403 - { "error": "Permission denied: inbox:reply", "code": "PERMISSION_DENIED" }
   */
  async store({ request, params, serialize }: HttpContext) {
    const { id } = await request.validateUsing(conversationIdParamValidator, {
      data: params,
    })
    const payload = await request.validateUsing(createMessageValidator)

    const message = await new MessageService().sendAgentReply({
      organizationId: request.activeMember!.organizationId,
      conversationId: id,
      senderId: request.authUser!.id,
      contentType: payload.contentType,
      contentText: payload.contentText,
      mediaAssetId: payload.mediaAssetId,
    })

    return serialize(message)
  }
}
