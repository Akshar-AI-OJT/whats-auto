import type { HttpContext } from '@adonisjs/core/http'
import ConversationNotePolicy from '#policies/conversation_note_policy'
import { ConversationNoteService } from '#services/conversation_note_service'
import { conversationIdParamValidator } from '#validators/conversation'
import { createConversationNoteValidator } from '#validators/conversation_note'
import '#types/http'

export default class ConversationNotesController {
  /**
   * @index
   * @summary List internal conversation notes
   * @description Returns all internal agent notes for a conversation, ordered by createdAt ASC. Notes are never sent to WhatsApp.
   * @tag Inbox Notes
   * @security BearerAuth
   * @paramPath id - Conversation id - @type(string)
   * @responseBody 200 - { "data": [{ "id": "uuid", "conversationId": "uuid", "noteText": "Customer called about order #104", "createdBy": { "id": "uuid", "name": "Ada", "email": "ada@example.com" }, "createdAt": "2026-08-04T12:00:00.000Z" }] }
   * @responseBody 404 - { "error": "Conversation not found", "code": "E_CONVERSATION_NOT_FOUND" }
   * @responseBody 403 - { "error": "Permission denied: inbox:view", "code": "PERMISSION_DENIED" }
   */
  async index({ bouncer, request, params, serialize }: HttpContext) {
    const { id } = await request.validateUsing(conversationIdParamValidator, {
      data: params,
    })

    await bouncer.with(ConversationNotePolicy).authorize('viewList', {
      organizationId: request.activeMember!.organizationId,
      id,
    })

    const notes = await new ConversationNoteService().listNotes({
      organizationId: request.activeMember!.organizationId,
      conversationId: id,
    })

    return serialize(notes)
  }

  /**
   * @store
   * @summary Create an internal conversation note
   * @description Creates an internal team note for agents/admins. Does not send to WhatsApp or create a customer-visible message.
   * @tag Inbox Notes
   * @security BearerAuth
   * @paramPath id - Conversation id - @type(string)
   * @requestBody { "noteText": "Customer called about order #104" }
   * @responseBody 200 - { "data": { "id": "uuid", "conversationId": "uuid", "noteText": "Customer called about order #104", "createdBy": { "id": "uuid", "name": "Ada", "email": "ada@example.com" }, "createdAt": "2026-08-04T12:00:00.000Z" } }
   * @responseBody 404 - { "error": "Conversation not found", "code": "E_CONVERSATION_NOT_FOUND" }
   * @responseBody 403 - { "error": "Permission denied: inbox:reply", "code": "PERMISSION_DENIED" }
   */
  async store({ bouncer, request, params, serialize }: HttpContext) {
    const { id } = await request.validateUsing(conversationIdParamValidator, {
      data: params,
    })

    await bouncer.with(ConversationNotePolicy).authorize('create', {
      organizationId: request.activeMember!.organizationId,
      id,
    })

    const payload = await request.validateUsing(createConversationNoteValidator)

    const note = await new ConversationNoteService().createNote({
      organizationId: request.activeMember!.organizationId,
      conversationId: id,
      authorUserId: request.authUser!.id,
      noteText: payload.noteText,
    })

    return serialize(note)
  }
}
