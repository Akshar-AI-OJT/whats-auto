import type { HttpContext } from '@adonisjs/core/http'
import { accessPlatform } from '#abilities/main'
import SuperAdminPolicy from '#policies/super_admin_policy'
import { SuperAdminPlatformUsersService } from '#services/super_admin_platform_users_service'
import { listSuperAdminPlatformUsersValidator } from '#validators/super_admin_platform_users'
import '#types/http'

export default class SuperAdminPlatformUsersController {
  /**
   * @index
   * @summary List all platform users (Super Admin)
   * @description Platform-wide paginated user list across every organization. Requires Super Admin role and platform:tenants_view. Does not use the active organization.
   * @tag Super-Admin
   * @security BearerAuth
   * @paramQuery page - Page number (default 1) - @type(number)
   * @paramQuery perPage - Items per page (1-100, default 20) - @type(number)
   * @paramQuery search - Case-insensitive name or email search - @type(string)
   * @paramQuery status - active|inactive|all - @type(string)
   * @paramQuery organizationId - Filter to users with a live membership in this organization - @type(string)
   * @paramQuery role - Filter by live organization membership role name - @type(string)
   * @responseBody 200 - { "data": [{ "id": "uuid", "name": "Ada Agent", "email": "agent@example.com", "isActive": true, "status": "active", "platformRole": null, "organizations": [] }], "meta": { "total": 1, "perPage": 20, "currentPage": 1, "lastPage": 1 } }
   * @responseBody 401 - { "error": "Missing or invalid session" }
   * @responseBody 403 - { "error": "Permission denied: platform:tenants_view", "code": "PERMISSION_DENIED" }
   */
  async index({ bouncer, request, serialize }: HttpContext) {
    await bouncer.authorize(accessPlatform)
    await bouncer.with(SuperAdminPolicy).authorize('viewPlatformUsers')

    const query = await request.validateUsing(listSuperAdminPlatformUsersValidator, {
      data: request.qs(),
    })

    const users = await new SuperAdminPlatformUsersService().listPlatformUsersPaginated({
      page: query.page ?? 1,
      perPage: query.perPage ?? 20,
      search: query.search,
      status: query.status,
      organizationId: query.organizationId,
      role: query.role,
    })

    return serialize(users)
  }
}
