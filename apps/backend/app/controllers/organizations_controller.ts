import type { HttpContext } from '@adonisjs/core/http'
import { OrganizationService } from '#services/organization_service'
import { mapRbacError } from '#lib/map_rbac_error'
import {
  createOrganizationValidator,
  updateOrganizationValidator,
} from '#validators/organization_crud'
import '#types/http'

export default class OrganizationsController {
  /**
   * @summary Create an organization
   * @description Creates the org, makes the caller owner, and sets it as the active organization on the current session.
   * @tag Organizations
   * @security BearerAuth
   * @requestBody { "name": "Acme Inc", "slug": "acme", "email": "ops@acme.com", "country": "US", "timezone": "America/New_York" }
   * @responseBody 200 - { "data": { "id": "uuid", "name": "Acme Inc", "slug": "acme", "role": "owner" } }
   * @responseBody 401 - { "error": "Missing or invalid session" }
   * @responseBody 409 - { "error": "Accept or decline your pending invitation before creating an organization", "code": "E_INVITE_PENDING" }
   */
  async store({ request, response, serialize }: HttpContext) {
    const payload = await request.validateUsing(createOrganizationValidator)

    try {
      const org = await new OrganizationService().createOrganization({
        userId: request.authUser!.id,
        sessionId: request.sessionId!,
        data: payload,
      })
      return serialize(org)
    } catch (error) {
      return mapRbacError(error, response)
    }
  }

  /**
   * @summary List organizations the current user belongs to
   * @tag Organizations
   * @security BearerAuth
   * @responseBody 200 - { "data": [{ "id": "uuid", "name": "Acme", "slug": "acme", "role": "owner" }] }
   */
  async index({ request, serialize }: HttpContext) {
    const orgs = await new OrganizationService().listMyOrganizations(request.authUser!.id)
    return serialize(orgs)
  }

  /**
   * @summary Set the active organization for the current session
   * @tag Organizations
   * @security BearerAuth
   * @paramPath id - Organization id - @type(string)
   * @responseBody 200 - { "data": { "organizationId": "uuid" } }
   * @responseBody 422 - { "error": "You are not a member of this organization", "code": "E_ORG_NOT_A_MEMBER" }
   */
  async setActive({ request, params, response, serialize }: HttpContext) {
    try {
      const result = await new OrganizationService().setActiveOrganization({
        userId: request.authUser!.id,
        sessionId: request.sessionId!,
        organizationId: params.id,
      })
      return serialize(result)
    } catch (error) {
      return mapRbacError(error, response)
    }
  }

  /**
   * @summary Update an organization
   * @description Path `:id` must match the session active organization. Editable fields: name, phone, website, industry, timezone, currency. Slug and email cannot be changed.
   * @tag Organizations
   * @security BearerAuth
   * @paramPath id - Organization id - @type(string)
   * @requestBody { "name": "Acme Corp" }
   * @responseBody 200 - { "data": { "id": "uuid", "name": "Acme Corp" } }
   * @responseBody 403 - { "error": "Permission denied: org:settings_manage", "code": "PERMISSION_DENIED" }
   */
  async update({ request, params, response, serialize }: HttpContext) {
    const mismatch = this.assertActiveOrg(params.id, request.activeMember!.organizationId, response)
    if (mismatch) return mismatch

    const payload = await request.validateUsing(updateOrganizationValidator)

    try {
      const org = await new OrganizationService().updateOrganization({
        organizationId: params.id,
        actorUserId: request.authUser!.id,
        patch: payload,
      })
      return serialize(org)
    } catch (error) {
      return mapRbacError(error, response)
    }
  }

  /**
   * @summary Soft-delete an organization
   * @description Path `:id` must match the session active organization. Owner-only. Cascades members, invitations, role overrides, and user_roles. Audit history is retained.
   * @tag Organizations
   * @security BearerAuth
   * @paramPath id - Organization id - @type(string)
   * @responseBody 200 - { "data": { "ok": true } }
   * @responseBody 403 - { "error": "Only the organization owner can delete the organization.", "code": "NOT_OWNER" }
   */
  async destroy({ request, params, response, serialize }: HttpContext) {
    const mismatch = this.assertActiveOrg(params.id, request.activeMember!.organizationId, response)
    if (mismatch) return mismatch

    if (request.activeMember!.role !== 'owner') {
      return response.forbidden({
        error: 'Only the organization owner can delete the organization.',
        code: 'NOT_OWNER',
      })
    }

    try {
      await new OrganizationService().deleteOrganization({
        organizationId: params.id,
        actorUserId: request.authUser!.id,
      })
      return serialize({ ok: true })
    } catch (error) {
      return mapRbacError(error, response)
    }
  }

  /** Tenant middleware scopes the active org; path `:id` must not target a different org. */
  private assertActiveOrg(pathId: string, activeOrgId: string, response: HttpContext['response']) {
    if (pathId !== activeOrgId) {
      return response.forbidden({
        error: 'Organization id does not match the active organization. Call set-active first.',
        code: 'ORG_ID_MISMATCH',
      })
    }
    return null
  }
}
