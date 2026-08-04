import type { HttpContext } from '@adonisjs/core/http'
import { ConversationService } from '#services/conversation_service'
import {
  assignConversationValidator,
  conversationIdParamValidator,
  createConversationValidator,
  listConversationsValidator,
  updateConversationValidator,
} from '#validators/conversation'
import '#types/http'

export default class ConversationsController {
  /**
   * @index
   * @summary List inbox conversations
   * @description Paginated conversation list for the active organization. Supports status, agent, and contact search filters.
   * @tag Inbox Conversations
   * @security BearerAuth
   * @paramQuery status - Filter by status (open, pending, closed) - @type(string)
   * @paramQuery assignedAgentId - Filter by assigned agent user id - @type(string)
   * @paramQuery search - Search by contact name or phone - @type(string)
   * @paramQuery page - Page number (default 1) - @type(number)
   * @paramQuery limit - Items per page (1-100, default 20) - @type(number)
   * @responseBody 200 - { "data": [{ "id": "uuid", "status": "open", "contactId": "uuid", "unreadCount": 0, "contact": { "id": "uuid", "name": "Ada", "phone": "+15551234567" } }], "meta": { "total": 1, "perPage": 20, "currentPage": 1, "lastPage": 1 } }
   * @responseBody 403 - { "error": "Permission denied: inbox:view", "code": "PERMISSION_DENIED" }
   */
  async index({ request, serialize }: HttpContext) {
    const qs = await request.validateUsing(listConversationsValidator, {
      data: request.qs(),
    })

    const result = await new ConversationService().listConversationsPaginated({
      organizationId: request.activeMember!.organizationId,
      status: qs.status,
      assignedAgentId: qs.assignedAgentId,
      search: qs.search,
      page: qs.page,
      limit: qs.limit,
    })

    return serialize(result)
  }

  /**
   * @show
   * @summary Get a conversation by id
   * @description Returns conversation details, contact summary, and unread message count.
   * @tag Inbox Conversations
   * @security BearerAuth
   * @paramPath id - Conversation id - @type(string)
   * @responseBody 200 - { "data": { "id": "uuid", "status": "open", "unreadCount": 2, "unreadMessageCount": 2, "contact": { "id": "uuid", "name": "Ada", "phone": "+15551234567" } } }
   * @responseBody 404 - { "error": "Conversation not found", "code": "E_CONVERSATION_NOT_FOUND" }
   * @responseBody 403 - { "error": "Permission denied: inbox:view", "code": "PERMISSION_DENIED" }
   */
  async show({ request, params, serialize }: HttpContext) {
    const { id } = await request.validateUsing(conversationIdParamValidator, {
      data: params,
    })

    const conversation = await new ConversationService().getConversationById({
      organizationId: request.activeMember!.organizationId,
      conversationId: id,
    })

    return serialize(conversation)
  }

  /**
   * @store
   * @summary Create or open a conversation
   * @description Creates a new conversation for a contact and WhatsApp config. Reopens a closed conversation for the same pair; rejects duplicate active conversations.
   * @tag Inbox Conversations
   * @security BearerAuth
   * @requestBody { "contactId": "uuid", "whatsappConfigId": "uuid" }
   * @responseBody 200 - { "data": { "id": "uuid", "status": "open", "contactId": "uuid", "whatsappConfigId": "uuid" } }
   * @responseBody 404 - { "error": "Contact not found", "code": "E_CONTACT_NOT_FOUND" }
   * @responseBody 409 - { "error": "An active conversation already exists for this contact and WhatsApp number", "code": "E_CONVERSATION_DUPLICATE_ACTIVE" }
   * @responseBody 403 - { "error": "Permission denied: inbox:view", "code": "PERMISSION_DENIED" }
   */
  async store({ request, serialize }: HttpContext) {
    const payload = await request.validateUsing(createConversationValidator)

    const conversation = await new ConversationService().createConversation({
      organizationId: request.activeMember!.organizationId,
      contactId: payload.contactId,
      whatsappConfigId: payload.whatsappConfigId,
    })

    return serialize(conversation)
  }

  /**
   * @update
   * @summary Partially update a conversation
   * @description Updates editable conversation fields (currently status). closedAt is kept in sync with status.
   * @tag Inbox Conversations
   * @security BearerAuth
   * @paramPath id - Conversation id - @type(string)
   * @requestBody { "status": "pending" }
   * @responseBody 200 - { "data": { "id": "uuid", "status": "pending" } }
   * @responseBody 404 - { "error": "Conversation not found", "code": "E_CONVERSATION_NOT_FOUND" }
   * @responseBody 403 - { "error": "Permission denied: inbox:view", "code": "PERMISSION_DENIED" }
   */
  async update({ request, params, serialize }: HttpContext) {
    const { id } = await request.validateUsing(conversationIdParamValidator, {
      data: params,
    })
    const payload = await request.validateUsing(updateConversationValidator)

    const conversation = await new ConversationService().updateConversation({
      organizationId: request.activeMember!.organizationId,
      conversationId: id,
      status: payload.status,
    })

    return serialize(conversation)
  }

  /**
   * @assign
   * @summary Assign a conversation to an agent
   * @description Sets assignedAgentId and appends a row to conversation_assignments history.
   * @tag Inbox Conversations
   * @security BearerAuth
   * @paramPath id - Conversation id - @type(string)
   * @requestBody { "assignedAgentId": "uuid" }
   * @responseBody 200 - { "data": { "id": "uuid", "assignedAgentId": "uuid", "status": "open" } }
   * @responseBody 404 - { "error": "Conversation not found", "code": "E_CONVERSATION_NOT_FOUND" }
   * @responseBody 403 - { "error": "Permission denied: inbox:assign", "code": "PERMISSION_DENIED" }
   */
  async assign({ request, params, serialize }: HttpContext) {
    const { id } = await request.validateUsing(conversationIdParamValidator, {
      data: params,
    })
    const payload = await request.validateUsing(assignConversationValidator)

    const conversation = await new ConversationService().assignConversation({
      organizationId: request.activeMember!.organizationId,
      conversationId: id,
      assignedAgentId: payload.assignedAgentId,
      assignedByUserId: request.authUser!.id,
    })

    return serialize(conversation)
  }

  /**
   * @close
   * @summary Close a conversation
   * @description Sets status to closed and closedAt to the current timestamp.
   * @tag Inbox Conversations
   * @security BearerAuth
   * @paramPath id - Conversation id - @type(string)
   * @responseBody 200 - { "data": { "id": "uuid", "status": "closed", "closedAt": "2026-08-03T12:00:00.000Z" } }
   * @responseBody 404 - { "error": "Conversation not found", "code": "E_CONVERSATION_NOT_FOUND" }
   * @responseBody 403 - { "error": "Permission denied: inbox:close", "code": "PERMISSION_DENIED" }
   */
  async close({ request, params, serialize }: HttpContext) {
    const { id } = await request.validateUsing(conversationIdParamValidator, {
      data: params,
    })

    const conversation = await new ConversationService().closeConversation({
      organizationId: request.activeMember!.organizationId,
      conversationId: id,
    })

    return serialize(conversation)
  }

  /**
   * @reopen
   * @summary Reopen a conversation
   * @description Sets status to open and clears closedAt.
   * @tag Inbox Conversations
   * @security BearerAuth
   * @paramPath id - Conversation id - @type(string)
   * @responseBody 200 - { "data": { "id": "uuid", "status": "open" } }
   * @responseBody 404 - { "error": "Conversation not found", "code": "E_CONVERSATION_NOT_FOUND" }
   * @responseBody 403 - { "error": "Permission denied: inbox:close", "code": "PERMISSION_DENIED" }
   */
  async reopen({ request, params, serialize }: HttpContext) {
    const { id } = await request.validateUsing(conversationIdParamValidator, {
      data: params,
    })

    const conversation = await new ConversationService().reopenConversation({
      organizationId: request.activeMember!.organizationId,
      conversationId: id,
    })

    return serialize(conversation)
  }
}
