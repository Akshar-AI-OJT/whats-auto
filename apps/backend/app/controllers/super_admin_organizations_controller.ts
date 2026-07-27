import type { HttpContext } from '@adonisjs/core/http'
import { OrganizationService } from '#services/organization_service'
import { listSuperAdminOrganizationsValidator } from '#validators/organization_crud'
import '#types/http'

export default class SuperAdminOrganizationsController {
  /**
   * @summary List all organizations (Super Admin)
   * @description Platform-wide paginated organization list. Requires Super Admin role and platform:tenants_view permission.
   * @tag Super Admin
   * @security BearerAuth
   * @paramQuery page - Page number (default 1) - @type(number)
   * @paramQuery perPage - Items per page (1-100, default 20) - @type(number)
   * @responseBody 200 - { "data": [{ "id": "uuid", "name": "Acme", "slug": "acme", "email": "ops@acme.com", "status": true }], "meta": { "total": 1, "perPage": 20, "currentPage": 1, "lastPage": 1 } }
   * @responseBody 401 - { "error": "Missing or invalid session" }
   * @responseBody 403 - { "error": "Permission denied: platform:tenants_view", "code": "PERMISSION_DENIED" }
   */
  async index({ request, serialize }: HttpContext) {
    const { page, perPage } = await request.validateUsing(listSuperAdminOrganizationsValidator, {
      data: request.qs(),
    })

    const organizations = await new OrganizationService().listOrganizationsPaginated({
      page: page ?? 1,
      perPage: perPage ?? 20,
    })

    return serialize(organizations)
  }
}
