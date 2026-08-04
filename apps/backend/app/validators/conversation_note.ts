import vine from '@vinejs/vine'

export const createConversationNoteValidator = vine.create(
  vine.object({
    noteText: vine.string().trim().minLength(1).maxLength(4096),
  })
)
