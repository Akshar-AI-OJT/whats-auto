import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'

export default class AccessContextController {
  async show({ request, serialize }: HttpContext) {
    const { activeMember, memberPermissions, authUser } = request
    const org = await db
      .from('organizations')
      .where('id', activeMember!.organizationId)
      .firstOrFail()
    const roleRow =
      activeMember!.role === 'owner'
        ? { displayName: 'Owner' }
        : await db
            .from('organization_roles')
            .where('organizationId', activeMember!.organizationId)
            .where('role', activeMember!.role)
            .select('displayName')
            .first()

    return serialize({
      organizationId: activeMember!.organizationId,
      organizationName: org.name,
      memberId: activeMember!.id,
      role: activeMember!.role,
      displayName: roleRow?.displayName ?? activeMember!.role,
      isOwner: activeMember!.role === 'owner',
      permissions: [...(memberPermissions ?? [])],
    })
  }
}
