import type { HttpContext } from '@adonisjs/core/http'
import { SubscriptionService } from '#services/subscription_service'
import {
  createSuperAdminSubscriptionValidator,
  listSuperAdminSubscriptionsValidator,
  subscriptionIdParamValidator,
  updateSuperAdminSubscriptionValidator,
} from '#validators/subscription_crud'
import '#types/http'

export default class SuperAdminSubscriptionsController {
  /**
   * @summary List all subscriptions (Super Admin)
   * @description Platform-wide paginated subscription list. Requires Super Admin role and platform:tenants_billing permission.
   * @tag Super Admin
   * @security BearerAuth
   * @paramQuery page - Page number (default 1) - @type(number)
   * @paramQuery perPage - Items per page (1-100, default 20) - @type(number)
   * @responseBody 200 - { "data": [{ "id": "uuid", "organizationId": "uuid", "planId": "uuid", "status": "active" }], "meta": { "total": 1, "perPage": 20, "currentPage": 1, "lastPage": 1 } }
   * @responseBody 401 - { "error": "Missing or invalid session" }
   * @responseBody 403 - { "error": "Permission denied: platform:tenants_billing", "code": "PERMISSION_DENIED" }
   */
  async index({ request, serialize }: HttpContext) {
    const { page, perPage } = await request.validateUsing(listSuperAdminSubscriptionsValidator, {
      data: request.qs(),
    })

    const subscriptions = await new SubscriptionService().listSubscriptionsPaginated({
      page: page ?? 1,
      perPage: perPage ?? 20,
    })

    return serialize(subscriptions)
  }

  /**
   * @summary Create a subscription (Super Admin)
   * @description Platform-wide subscription create. Requires Super Admin role and platform:tenants_billing permission.
   * @tag Super Admin
   * @security BearerAuth
   * @requestBody { "organizationId": "uuid", "planId": "uuid", "status": "active", "currentPeriodStart": "2026-07-29T00:00:00.000Z", "currentPeriodEnd": "2026-08-29T00:00:00.000Z" }
   * @responseBody 200 - { "data": { "id": "uuid", "organizationId": "uuid", "planId": "uuid", "status": "active" } }
   * @responseBody 401 - { "error": "Missing or invalid session" }
   * @responseBody 403 - { "error": "Permission denied: platform:tenants_billing", "code": "PERMISSION_DENIED" }
   * @responseBody 404 - { "error": "Organization Not Found", "code": "E_ORGANIZATION_NOT_FOUND" }
   * @responseBody 422 - { "error": "currentPeriodEnd must be after currentPeriodStart", "code": "E_SUBSCRIPTION_INVALID_PERIOD" }
   */
  async store({ request, serialize }: HttpContext) {
    const payload = await request.validateUsing(createSuperAdminSubscriptionValidator)

    const subscription = await new SubscriptionService().createSubscription(payload)

    return serialize(subscription)
  }

  /**
   * @summary Get a subscription by id (Super Admin)
   * @description Platform-wide subscription detail. Requires Super Admin role and platform:tenants_billing permission.
   * @tag Super Admin
   * @security BearerAuth
   * @paramPath id - Subscription id - @type(string)
   * @responseBody 200 - { "data": { "id": "uuid", "organizationId": "uuid", "planId": "uuid", "status": "active" } }
   * @responseBody 401 - { "error": "Missing or invalid session" }
   * @responseBody 403 - { "error": "Permission denied: platform:tenants_billing", "code": "PERMISSION_DENIED" }
   * @responseBody 404 - { "error": "Subscription Not Found", "code": "E_SUBSCRIPTION_NOT_FOUND" }
   */
  async show({ request, params, serialize }: HttpContext) {
    const { id } = await request.validateUsing(subscriptionIdParamValidator, {
      data: params,
    })

    const subscription = await new SubscriptionService().getSubscriptionById(id)

    return serialize(subscription)
  }

  /**
   * @summary Update a subscription (Super Admin)
   * @description Platform-wide partial update. Only provided fields are changed. Requires Super Admin role and platform:tenants_billing permission.
   * @tag Super Admin
   * @security BearerAuth
   * @paramPath id - Subscription id - @type(string)
   * @requestBody { "status": "past_due", "currentPeriodEnd": "2026-09-29T00:00:00.000Z" }
   * @responseBody 200 - { "data": { "id": "uuid", "organizationId": "uuid", "planId": "uuid", "status": "past_due" } }
   * @responseBody 401 - { "error": "Missing or invalid session" }
   * @responseBody 403 - { "error": "Permission denied: platform:tenants_billing", "code": "PERMISSION_DENIED" }
   * @responseBody 404 - { "error": "Subscription Not Found", "code": "E_SUBSCRIPTION_NOT_FOUND" }
   * @responseBody 422 - { "error": "currentPeriodEnd must be after currentPeriodStart", "code": "E_SUBSCRIPTION_INVALID_PERIOD" }
   */
  async update({ request, params, serialize }: HttpContext) {
    const { id } = await request.validateUsing(subscriptionIdParamValidator, {
      data: params,
    })
    const payload = await request.validateUsing(updateSuperAdminSubscriptionValidator)

    const subscription = await new SubscriptionService().updateSubscription(id, payload)

    return serialize(subscription)
  }

  /**
   * @summary Soft-delete a subscription (Super Admin)
   * @description Marks the subscription as cancelled without removing the row. Requires Super Admin role and platform:tenants_billing permission.
   * @tag Super Admin
   * @security BearerAuth
   * @paramPath id - Subscription id - @type(string)
   * @responseBody 200 - { "data": { "ok": true } }
   * @responseBody 401 - { "error": "Missing or invalid session" }
   * @responseBody 403 - { "error": "Permission denied: platform:tenants_billing", "code": "PERMISSION_DENIED" }
   * @responseBody 404 - { "error": "Subscription Not Found", "code": "E_SUBSCRIPTION_NOT_FOUND" }
   * @responseBody 409 - { "error": "Subscription is already deleted", "code": "E_SUBSCRIPTION_ALREADY_DELETED" }
   */
  async softDelete({ request, params, serialize }: HttpContext) {
    const { id } = await request.validateUsing(subscriptionIdParamValidator, {
      data: params,
    })

    await new SubscriptionService().softDeleteSubscription(id)

    return serialize({ ok: true })
  }
}
