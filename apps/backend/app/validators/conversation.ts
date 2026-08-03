import vine from '@vinejs/vine'

export const CONVERSATION_STATUSES = ['open', 'pending', 'closed'] as const

export const listConversationsValidator = vine.create(
  vine.object({
    status: vine.enum(CONVERSATION_STATUSES).optional(),
    assignedAgentId: vine.string().trim().uuid().optional(),
    search: vine.string().trim().minLength(1).maxLength(255).optional(),
    page: vine.number().withoutDecimals().min(1).optional(),
    limit: vine.number().withoutDecimals().min(1).max(100).optional(),
  })
)

export const conversationIdParamValidator = vine.create(
  vine.object({
    id: vine.string().trim().uuid(),
  })
)

export const createConversationValidator = vine.create(
  vine.object({
    contactId: vine.string().trim().uuid(),
    whatsappConfigId: vine.string().trim().uuid(),
  })
)

export const updateConversationValidator = vine.create(
  vine.object({
    status: vine.enum(CONVERSATION_STATUSES).optional(),
  })
)

export const assignConversationValidator = vine.create(
  vine.object({
    assignedAgentId: vine.string().trim().uuid(),
  })
)
