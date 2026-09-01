import type { HttpContext } from '@adonisjs/core/http'
import OrganizationPolicy from '#policies/organization_policy'
import { OrganizationService } from '#services/organization_service'
import { mapRbacError } from '#lib/map_rbac_error'
import { attachClearAccessToken, attachRemintedAccessToken } from '#lib/access_token_response'
import {
  createOrganizationValidator,
  updateOrganizationValidator,
} from '#validators/organization_crud'
import '#types/http'

export default class OrganizationsController {
  /**
   * @store
   * @summary Create an organization
   * @description Creates the org, makes the caller owner, and sets it as the active organization on the current session.
   * @tag Organizations
   * @security BearerAuth
   * @requestBody { "name": "Acme Inc", "slug": "acme", "email": "ops@acme.com", "phone": "+919876543210", "organizationType": "company", "address": "221B Baker Street, Mumbai", "country": "IN", "timezone": "Asia/Kolkata" }
   * @responseBody 200 - { "data": { "id": "uuid", "name": "Acme Inc", "slug": "acme", "role": "owner" } }
   * @responseHeader 200 - set-auth-jwt - Reminted access token for the new organization - @type(string)
   * @responseBody 401 - { "error": "Missing or invalid session" }
   * @responseBody 409 - { "error": "Accept or decline your pending invitation before creating an organization", "code": "E_INVITE_PENDING" }
   * @responseBody 409 - { "error": "Organization slug already in use", "code": "E_ORG_SLUG_ALREADY_EXISTS", "field": "slug" }
   */
  async store({ request, response, serialize }: HttpContext) {
    const payload = await request.validateUsing(createOrganizationValidator)

    try {
      const org = await new OrganizationService().createOrganization({
        userId: request.authUser!.id,
        sessionId: request.sessionId!,
        data: payload,
      })
      // Only remint when the new (or reused) pending org became the active session.
      // Creating a second organization must not strand the owner on an unpaid org.
      if (org.sessionActivated) {
        await attachRemintedAccessToken({ request, response }, request.sessionId!)
      }
      return serialize(org)
    } catch (error) {
      return mapRbacError(error, response)
    }
  }

  /**
   * @index
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
   * @setActive
   * @summary Set the active organization for the current session
   * @description Updates the session active organization and returns a reminted JWT in set-auth-jwt.
   * @tag Organizations
   * @security BearerAuth
   * @paramPath id - Organization id - @type(string)
   * @responseBody 200 - { "data": { "organizationId": "uuid" } }
   * @responseHeader 200 - set-auth-jwt - Reminted access token for the selected organization - @type(string)
   * @responseBody 422 - { "error": "You are not a member of this organization", "code": "E_ORG_NOT_A_MEMBER" }
   */
  async setActive({ request, params, response, serialize }: HttpContext) {
    try {
      const result = await new OrganizationService().setActiveOrganization({
        userId: request.authUser!.id,
        sessionId: request.sessionId!,
        organizationId: params.id,
      })
      await attachRemintedAccessToken({ request, response }, request.sessionId!)
      return serialize(result)
    } catch (error) {
      return mapRbacError(error, response)
    }
  }

  /**
   * @update
   * @summary Update an organization
   * @description Path `:id` must match the session active organization. Editable fields include name, phone, website, industry, organizationType, address (structured JSON), pan, gstin, timezone, currency, description, businessSize, alternatePhone, defaultLanguage, businessRegistrationNumber, and designation (caller's membership). Slug and email cannot be changed.
   * @tag Organizations
   * @security BearerAuth
   * @paramPath id - Organization id - @type(string)
   * @requestBody { "name": "Acme Corp" }
   * @responseBody 200 - { "data": { "id": "uuid", "name": "Acme Corp" } }
   * @responseBody 403 - { "error": "Permission denied: org:settings_manage", "code": "PERMISSION_DENIED" }
   */
  async update({ bouncer, request, params, response, serialize }: HttpContext) {
    await bouncer.with(OrganizationPolicy).authorize('update', params.id)

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
   * @destroy
   * @summary Soft-delete an organization
   * @description Path `:id` must match the session active organization. Owner-only. Marks the organization deleted and cuts off access for every member; nothing owned by the organization is erased.
   * @tag Organizations
   * @security BearerAuth
   * @paramPath id - Organization id - @type(string)
   * @responseBody 200 - { "data": { "ok": true } }
   * @responseHeader 200 - Clear-Auth-Jwt - Drop the in-memory access token; there is no replacement - @type(string)
   * @responseBody 403 - { "error": "Only the organization owner can delete the organization.", "code": "NOT_OWNER" }
   */
  async destroy({ bouncer, request, params, response, serialize }: HttpContext) {
    await bouncer.with(OrganizationPolicy).authorize('delete', params.id)

    try {
      await new OrganizationService().softDeleteOrganization({
        organizationId: params.id,
        actorUserId: request.authUser!.id,
      })
      attachClearAccessToken(response)
      return serialize({ ok: true })
    } catch (error) {
      return mapRbacError(error, response)
    }
  }
}
