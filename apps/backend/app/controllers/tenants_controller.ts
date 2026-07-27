import type { HttpContext } from '@adonisjs/core/http'
import { TenantService } from '#services/tenant_service'
import {
  createTenantValidator,
  tenantIdValidator,
  updateTenantValidator,
} from '#validators/tenant'
import '#types/http'

export default class TenantsController {
  /**
   * @summary Create a tenant (organization)
   * @description Creates an organization, assigns the caller as owner, and seeds default roles.
   * @tag Tenants
   * @security BearerAuth
   * @requestBody { "name": "Acme Inc", "slug": "acme-inc", "logo": "https://cdn.example.com/logo.png" }
   * @responseBody 200 - { "data": { "id": "uuid", "name": "Acme Inc", "slug": "acme-inc", "role": "owner" } }
   * @responseBody 401 - { "error": "Missing or invalid session" }
   * @responseBody 422 - { "error": "Tenant slug \"acme-inc\" is already taken.", "code": "E_TENANT_SLUG_TAKEN" }
   */
  async store({ request, serialize }: HttpContext) {
    const payload = await request.validateUsing(createTenantValidator)
    const tenant = await new TenantService().create({
      actorUserId: request.authUser!.id,
      name: payload.name,
      slug: payload.slug,
      logo: payload.logo,
      metadata: payload.metadata,
    })
    return serialize(tenant)
  }

  /**
   * @summary List tenants for the authenticated user
   * @tag Tenants
   * @security BearerAuth
   * @responseBody 200 - { "data": [{ "id": "uuid", "name": "Acme", "slug": "acme", "role": "owner" }] }
   * @responseBody 401 - { "error": "Missing or invalid session" }
   */
  async index({ request, serialize }: HttpContext) {
    const tenants = await new TenantService().listForUser(request.authUser!.id)
    return serialize(tenants)
  }

  /**
   * @summary Get a tenant by id
   * @description Caller must be a member of the tenant.
   * @tag Tenants
   * @security BearerAuth
   * @paramPath id - Organization (tenant) id - @type(string)
   * @responseBody 200 - { "data": { "id": "uuid", "name": "Acme", "slug": "acme", "role": "admin" } }
   * @responseBody 403 - { "error": "You are not a member of this tenant.", "code": "E_TENANT_NOT_A_MEMBER" }
   * @responseBody 404 - { "error": "Tenant not found.", "code": "E_TENANT_NOT_FOUND" }
   */
  async show({ request, serialize }: HttpContext) {
    const { id } = await request.validateUsing(tenantIdValidator, {
      data: request.params(),
    })
    const tenant = await new TenantService().findForMember(id, request.authUser!.id)
    return serialize(tenant)
  }

  /**
   * @summary Update a tenant
   * @description Owner only. Updates name, slug, logo, and/or metadata.
   * @tag Tenants
   * @security BearerAuth
   * @paramPath id - Organization (tenant) id - @type(string)
   * @requestBody { "name": "Acme Updated", "slug": "acme-updated" }
   * @responseBody 200 - { "data": { "id": "uuid", "name": "Acme Updated", "slug": "acme-updated", "role": "owner" } }
   * @responseBody 403 - { "error": "Only the tenant owner can perform this action.", "code": "E_TENANT_NOT_OWNER" }
   */
  async update({ request, serialize }: HttpContext) {
    const { id } = await request.validateUsing(tenantIdValidator, {
      data: request.params(),
    })
    const payload = await request.validateUsing(updateTenantValidator)
    const tenant = await new TenantService().update({
      organizationId: id,
      actorUserId: request.authUser!.id,
      name: payload.name,
      slug: payload.slug,
      logo: payload.logo,
      metadata: payload.metadata,
    })
    return serialize(tenant)
  }

  /**
   * @summary Delete a tenant
   * @description Owner only. Cascades members, roles, invitations, and related rows.
   * @tag Tenants
   * @security BearerAuth
   * @paramPath id - Organization (tenant) id - @type(string)
   * @responseBody 200 - { "data": { "ok": true } }
   * @responseBody 403 - { "error": "Only the tenant owner can perform this action.", "code": "E_TENANT_NOT_OWNER" }
   * @responseBody 404 - { "error": "Tenant not found.", "code": "E_TENANT_NOT_FOUND" }
   */
  async destroy({ request, serialize }: HttpContext) {
    const { id } = await request.validateUsing(tenantIdValidator, {
      data: request.params(),
    })
    await new TenantService().delete(id, request.authUser!.id)
    return serialize({ ok: true })
  }
}
