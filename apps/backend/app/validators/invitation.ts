import vine from '@vinejs/vine'

export const createInvitationValidator = vine.create(
  vine.object({
    email: vine.string().trim().email(),
    // role is a name string, not a fixed enum — custom org roles are invitable too;
    // existence + owner/superadmin rejection happens in InvitationService via resolveAssignableRoleForOrg
    role: vine.string().trim().minLength(1).maxLength(20),
  })
)
