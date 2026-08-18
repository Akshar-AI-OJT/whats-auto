import type { HttpContext } from '@adonisjs/core/http'
import ConversationPolicy from '#policies/conversation_policy'
import ConversationAiModeService from '#services/ai/conversation_ai_mode_service'
import { ConversationService } from '#services/conversation_service'
import { conversationIdParamValidator } from '#validators/conversation'
import '#types/http'

export default class ConversationAiController {
  /**
   * @takeover
   * @summary Take over a conversation from AI
   * @description Sets aiMode to HUMAN_ACTIVE and cancels a pending debounce job. Requires inbox:reply.
   * @tag Inbox Conversations
   * @security BearerAuth
   * @paramPath id - Conversation id - @type(string)
   * @responseBody 200 - { "data": { "id": "uuid", "aiMode": "HUMAN_ACTIVE", "aiHandoverReason": "takeover" } }
   * @responseBody 404 - { "error": "Conversation not found", "code": "E_CONVERSATION_NOT_FOUND" }
   * @responseBody 422 - { "error": "Conversation AI mode cannot change that way", "code": "E_CONVERSATION_AI_TRANSITION" }
   * @responseBody 403 - { "error": "Permission denied: inbox:reply", "code": "PERMISSION_DENIED" }
   */
  async takeover({ bouncer, request, params, serialize }: HttpContext) {
    const { id } = await request.validateUsing(conversationIdParamValidator, {
      data: params,
    })

    const existing = await new ConversationService().getConversationById({
      organizationId: request.activeMember!.organizationId,
      conversationId: id,
    })

    await bouncer.with(ConversationPolicy).authorize('takeoverAi', existing)

    const conversation = await new ConversationAiModeService().takeover({
      organizationId: request.activeMember!.organizationId,
      conversationId: id,
    })

    return serialize({
      id: conversation.id,
      aiMode: conversation.aiMode,
      aiHandoverReason: conversation.aiHandoverReason,
    })
  }

  /**
   * @resume
   * @summary Resume AI auto-reply
   * @description Sets aiMode to AI_AUTO from HANDOVER or HUMAN_ACTIVE. Requires inbox:reply.
   * @tag Inbox Conversations
   * @security BearerAuth
   * @paramPath id - Conversation id - @type(string)
   * @responseBody 200 - { "data": { "id": "uuid", "aiMode": "AI_AUTO", "aiHandoverReason": "" } }
   * @responseBody 404 - { "error": "Conversation not found", "code": "E_CONVERSATION_NOT_FOUND" }
   * @responseBody 422 - { "error": "Conversation AI mode cannot change that way", "code": "E_CONVERSATION_AI_TRANSITION" }
   * @responseBody 403 - { "error": "Permission denied: inbox:reply", "code": "PERMISSION_DENIED" }
   */
  async resume({ bouncer, request, params, serialize }: HttpContext) {
    const { id } = await request.validateUsing(conversationIdParamValidator, {
      data: params,
    })

    const existing = await new ConversationService().getConversationById({
      organizationId: request.activeMember!.organizationId,
      conversationId: id,
    })

    await bouncer.with(ConversationPolicy).authorize('resumeAi', existing)

    const conversation = await new ConversationAiModeService().resume({
      organizationId: request.activeMember!.organizationId,
      conversationId: id,
    })

    return serialize({
      id: conversation.id,
      aiMode: conversation.aiMode,
      aiHandoverReason: conversation.aiHandoverReason,
    })
  }
}
