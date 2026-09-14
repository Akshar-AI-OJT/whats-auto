import vine from '@vinejs/vine'

export const globalSearchQueryValidator = vine.create(
  vine.object({
    q: vine.string().trim().minLength(1).maxLength(200),
  })
)
