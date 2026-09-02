import type { HttpContext } from '@adonisjs/core/http'
import { accessPlatform } from '#abilities/main'
import SuperAdminPolicy from '#policies/super_admin_policy'
import { OrganizationService } from '#services/organization_service'
import { Exception } from '@adonisjs/core/exceptions'
import {
  listSuperAdminOrganizationsValidator,
  organizationIdParamValidator,
  updateOrganizationValidator,
} from '#validators/organization_crud'
import { mapRbacError } from '#lib/map_rbac_error'
import { attachClearAccessToken } from '#lib/access_token_response'
import '#types/http'

export default class SuperAdminOrganizationsController {
  /**
   * @index
   * @summary List all organizations (Super Admin)
   * @description Platform-wide paginated organization list. Requires Super Admin role and platform:tenants_view permission.
   * @tag Super-Admin
   * @security BearerAuth
   * @paramQuery page - Page number (default 1) - @type(number)
   * @paramQuery perPage - Items per page (1-100, default 20) - @type(number)
   * @responseBody 200 - { "data": [{ "id": "uuid", "name": "Acme", "slug": "acme", "email": "ops@acme.com", "status": true }], "meta": { "total": 1, "perPage": 20, "currentPage": 1, "lastPage": 1 } }
   * @responseBody 401 - { "error": "Missing or invalid session" }
   * @responseBody 403 - { "error": "Permission denied: platform:tenants_view", "code": "PERMISSION_DENIED" }
   */
  async index({ bouncer, request, serialize }: HttpContext) {
    await bouncer.authorize(accessPlatform)
    await bouncer.with(SuperAdminPolicy).authorize('viewTenants')

    const { page, perPage } = await request.validateUsing(listSuperAdminOrganizationsValidator, {
      data: request.qs(),
    })

    const organizations = await new OrganizationService().listOrganizationsPaginated({
      page: page ?? 1,
      perPage: perPage ?? 20,
    })

    return serialize(organizations)
  }

  /**
   * @summary Update an organization (Super Admin)
   * @description Platform-scoped partial update. Only provided fields are changed. Requires Super Admin role and platform:tenants_update permission.
   * @tag Super Admin
   * @security BearerAuth
   * @paramPath id - Organization id - @type(string)
   * @requestBody { "name": "Acme Updated", "phone": "+1-555-0100", "timezone": "UTC" }
   * @responseBody 200 - { "data": { "id": "uuid", "name": "Acme Updated", "slug": "acme", "email": "ops@acme.com" } }
   * @responseBody 401 - { "error": "Missing or invalid session" }
   * @responseBody 403 - { "error": "Permission denied: platform:tenants_update", "code": "PERMISSION_DENIED" }
   * @responseBody 404 - { "error": "Organization Not Found", "code": "E_ORGANIZATION_NOT_FOUND" }
   * @responseBody 422 - { "errors": [{ "message": "The name field must be at least 2 characters", "field": "name" }] }
   */
  async update({ bouncer, request, params, response, serialize }: HttpContext) {
    await bouncer.authorize(accessPlatform)
    await bouncer.with(SuperAdminPolicy).authorize('updateTenants')

    const payload = await request.validateUsing(updateOrganizationValidator)

    try {
      const organization = await new OrganizationService().updateOrganization({
        organizationId: params.id,
        actorUserId: request.authUser!.id,
        patch: payload,
      })
      return serialize(organization)
    } catch (error) {
      if (error instanceof Exception && error.code === 'E_ORGANIZATION_NOT_FOUND') {
        return response.notFound({
          error: 'Organization Not Found',
          code: 'E_ORGANIZATION_NOT_FOUND',
        })
      }
      return mapRbacError(error, response)
    }
  }

  /**
   * @softDelete
   * @summary Soft-delete an organization (Super Admin)
   * @description Marks the organization as deleted (soft delete) without removing the row. Requires Super Admin role and platform:tenants_delete permission.
   * @tag Super-Admin
   * @security BearerAuth
   * @paramPath id - Organization id - @type(string)
   * @responseBody 200 - { "data": { "ok": true } }
   * @responseHeader 200 - Clear-Auth-Jwt - Present when the deleted org was the caller's active organization - @type(string)
   * @responseBody 401 - { "error": "Missing or invalid session" }
   * @responseBody 403 - { "error": "Permission denied: platform:tenants_delete", "code": "PERMISSION_DENIED" }
   * @responseBody 404 - { "error": "Organization Not Found", "code": "E_ORGANIZATION_NOT_FOUND" }
   */
  async softDelete({ bouncer, request, params, response, serialize }: HttpContext) {
    await bouncer.authorize(accessPlatform)
    await bouncer.with(SuperAdminPolicy).authorize('deleteTenants')

    await request.validateUsing(organizationIdParamValidator, {
      data: params,
    })

    try {
      await new OrganizationService().softDeleteOrganization({
        organizationId: params.id,
        actorUserId: request.authUser!.id,
      })

      const activeOrgId =
        request.activeOrganizationId ?? request.accessTokenClaims?.org_id ?? undefined
      if (activeOrgId === params.id) {
        attachClearAccessToken(response)
      }

      return serialize({ ok: true })
    } catch (error) {
      if (error instanceof Exception && error.code === 'E_ORGANIZATION_NOT_FOUND') {
        return response.notFound({
          error: 'Organization Not Found',
          code: 'E_ORGANIZATION_NOT_FOUND',
        })
      }
      return mapRbacError(error, response)
    }
  }
}
