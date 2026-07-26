import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import '#types/http'

export default class AccessContextController {
  /**
   * @summary Get access context for the active organization
   * @description Returns org, role, and flat permissions for the current session. Call after login or organization set-active. Owner receives the full product permission catalog.
   * @tag Access
   * @security BearerAuth
   * @responseBody 200 - { "data": { "organizationId": "uuid", "organizationName": "Acme", "memberId": "uuid", "role": "owner", "displayName": "Owner", "isOwner": true, "permissions": ["inbox:view", "team:view"] } }
   * @responseBody 401 - { "error": "Missing or invalid session" }
   * @responseBody 403 - { "error": "No active organization. Call POST /api/v1/organizations/:id/set-active first.", "code": "NO_ACTIVE_ORG" }
   */
  async show({ request, serialize }: HttpContext) {
    const { activeMember, memberPermissions } = request
    const org = await db
      .from('organizations')
      .where('id', activeMember!.organizationId)
      .whereNull('deletedAt')
      .firstOrFail()

    const displayName = activeMember!.role.charAt(0).toUpperCase() + activeMember!.role.slice(1)

    return serialize({
      organizationId: activeMember!.organizationId,
      organizationName: org.name,
      memberId: activeMember!.id,
      role: activeMember!.role,
      displayName,
      isOwner: activeMember!.role === 'owner',
      permissions: [...(memberPermissions ?? [])],
    })
  }
}
