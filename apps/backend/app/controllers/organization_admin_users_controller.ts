import type { HttpContext } from '@adonisjs/core/http'
import { OrganizationAdminUsersService } from '#services/organization_admin_users_service'
import {
  listOrganizationAdminUsersValidator,
  organizationAdminUserIdParamValidator,
  updateOrganizationAdminUserValidator,
} from '#validators/organization_admin_users'
import { mapRbacError } from '#lib/map_rbac_error'
import '#types/http'

const ORGANIZATION_ADMIN_ROLES = new Set(['admin', 'owner'])

export default class OrganizationAdminUsersController {
  /**
   * @index
   * @summary List users in the active organization (Organization Admin)
   * @description Returns paginated users belonging to the authenticated Organization Admin's organization. Soft-deleted memberships are excluded. Requires admin or owner role.
   * @tag Organization-Admin
   * @security BearerAuth
   * @paramQuery page - Page number (default 1) - @type(number)
   * @paramQuery perPage - Items per page (1-100, default 20) - @type(number)
   * @responseBody 200 - { "data": [{ "id": "uuid", "name": "Ada Agent", "firstname": "Ada", "lastname": "Agent", "email": "agent@example.com", "isActive": true, "memberId": "uuid", "role": "agent" }], "meta": { "total": 1, "perPage": 20, "currentPage": 1, "lastPage": 1 } }
   * @responseBody 401 - { "error": "Missing or invalid session" }
   * @responseBody 403 - { "error": "Only organization admins can list organization users.", "code": "NOT_ORGANIZATION_ADMIN" }
   */
  async index({ request, response, serialize }: HttpContext) {
    if (!ORGANIZATION_ADMIN_ROLES.has(request.activeMember!.role)) {
      return response.forbidden({
        error: 'Only organization admins can list organization users.',
        code: 'NOT_ORGANIZATION_ADMIN',
      })
    }

    const { page, perPage } = await request.validateUsing(listOrganizationAdminUsersValidator, {
      data: request.qs(),
    })

    const users = await new OrganizationAdminUsersService().listUsersPaginated({
      organizationId: request.activeMember!.organizationId,
      page: page ?? 1,
      perPage: perPage ?? 20,
    })

    return serialize(users)
  }

  /**
   * @show
   * @summary Get a user by id in the active organization (Organization Admin)
   * @description Returns the user only when they belong to the authenticated Organization Admin's organization. Soft-deleted memberships and users from other organizations yield 404. Requires admin or owner role.
   * @tag Organization-Admin
   * @security BearerAuth
   * @paramPath id - User id - @type(string)
   * @responseBody 200 - { "data": { "id": "uuid", "name": "Ada Agent", "firstname": "Ada", "lastname": "Agent", "email": "agent@example.com", "isActive": true, "memberId": "uuid", "role": "agent" } }
   * @responseBody 401 - { "error": "Missing or invalid session" }
   * @responseBody 403 - { "error": "Only organization admins can view organization users.", "code": "NOT_ORGANIZATION_ADMIN" }
   * @responseBody 404 - { "error": "User Not Found", "code": "E_USER_NOT_FOUND" }
   */
  async show({ request, params, response, serialize }: HttpContext) {
    if (!ORGANIZATION_ADMIN_ROLES.has(request.activeMember!.role)) {
      return response.forbidden({
        error: 'Only organization admins can view organization users.',
        code: 'NOT_ORGANIZATION_ADMIN',
      })
    }

    const { id } = await request.validateUsing(organizationAdminUserIdParamValidator, {
      data: params,
    })

    const user = await new OrganizationAdminUsersService().getUserById({
      organizationId: request.activeMember!.organizationId,
      userId: id,
    })

    if (!user) {
      return response.notFound({
        error: 'User Not Found',
        code: 'E_USER_NOT_FOUND',
      })
    }

    return serialize(user)
  }

  /**
   * @update
   * @summary Update a user in the active organization (Organization Admin)
   * @description Partial update of profile fields for a user in the authenticated admin's organization. Soft-deleted memberships and users from other organizations yield 404. organization_id cannot be changed. Requires admin or owner role.
   * @tag Organization-Admin
   * @security BearerAuth
   * @paramPath id - User id - @type(string)
   * @requestBody { "firstname": "Ada", "lastname": "Agent", "email": "agent@example.com", "isActive": true }
   * @responseBody 200 - { "data": { "id": "uuid", "name": "Ada Agent", "firstname": "Ada", "lastname": "Agent", "email": "agent@example.com", "isActive": true, "memberId": "uuid", "role": "agent" } }
   * @responseBody 401 - { "error": "Missing or invalid session" }
   * @responseBody 403 - { "error": "Only organization admins can update organization users.", "code": "NOT_ORGANIZATION_ADMIN" }
   * @responseBody 404 - { "error": "User Not Found", "code": "E_USER_NOT_FOUND" }
   * @responseBody 422 - { "error": "An account with this email already exists.", "code": "EMAIL_ALREADY_EXISTS" }
   */
  async update({ request, params, response, serialize }: HttpContext) {
    if (!ORGANIZATION_ADMIN_ROLES.has(request.activeMember!.role)) {
      return response.forbidden({
        error: 'Only organization admins can update organization users.',
        code: 'NOT_ORGANIZATION_ADMIN',
      })
    }

    const { id } = await request.validateUsing(organizationAdminUserIdParamValidator, {
      data: params,
    })
    const payload = await request.validateUsing(updateOrganizationAdminUserValidator)

    try {
      const user = await new OrganizationAdminUsersService().updateUser({
        organizationId: request.activeMember!.organizationId,
        userId: id,
        actorUserId: request.authUser!.id,
        patch: payload,
      })

      if (!user) {
        return response.notFound({
          error: 'User Not Found',
          code: 'E_USER_NOT_FOUND',
        })
      }

      return serialize(user)
    } catch (error) {
      if (error instanceof Error && error.message === 'An account with this email already exists.') {
        return response.unprocessableEntity({
          error: error.message,
          code: 'EMAIL_ALREADY_EXISTS',
        })
      }
      return mapRbacError(error, response)
    }
  }

  /**
   * @softDelete
   * @operationId softDelete
   * @summary Remove a user from the active organization
   * @description Soft-deletes the organization_members row for the user in the active organization. Does not delete the user account.
   * @tag Organization-Admin
   * @security BearerAuth
   * @paramPath id - User id - @type(string)
   * @responseBody 200 - { "data": { "ok": true } }
   * @responseBody 401 - { "error": "Missing or invalid session" }
   * @responseBody 403 - { "error": "Only organization admins can delete organization users.", "code": "NOT_ORGANIZATION_ADMIN" }
   * @responseBody 404 - { "error": "User Not Found", "code": "E_USER_NOT_FOUND" }
   * @responseBody 422 - { "error": "Cannot remove the Owner. Transfer ownership first.", "code": "E_MEMBER_REMOVE_OWNER" }
   */
  async softDelete({ request, params, response, serialize }: HttpContext) {
    if (!ORGANIZATION_ADMIN_ROLES.has(request.activeMember!.role)) {
      return response.forbidden({
        error: 'Only organization admins can delete organization users.',
        code: 'NOT_ORGANIZATION_ADMIN',
      })
    }

    const { id } = await request.validateUsing(organizationAdminUserIdParamValidator, {
      data: params,
    })

    try {
      const result = await new OrganizationAdminUsersService().softDeleteUser({
        organizationId: request.activeMember!.organizationId,
        userId: id,
        actorUserId: request.authUser!.id,
      })

      if (!result) {
        return response.notFound({
          error: 'User Not Found',
          code: 'E_USER_NOT_FOUND',
        })
      }

      return serialize(result)
    } catch (error) {
      return mapRbacError(error, response)
    }
  }
}
