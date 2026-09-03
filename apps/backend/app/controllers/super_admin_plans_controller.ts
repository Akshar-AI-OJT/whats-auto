import type { HttpContext } from '@adonisjs/core/http'
import { inject } from '@adonisjs/core'
import SuperAdminPolicy from '#policies/super_admin_policy'
import { PlanService } from '#services/billing/plan_service'
import {
  createSuperAdminPlanValidator,
  listSuperAdminPlansValidator,
  planIdParamValidator,
  updateSuperAdminPlanValidator,
} from '#validators/plan_crud'
import '#types/http'

export default class SuperAdminPlansController {
  /**
   * @summary List billing plans (Super Admin)
   * @description Platform plan catalog with optional search/status filters and KPI summary. Requires platform:tenants_billing.
   * @tag Super Admin
   * @security BearerAuth
   * @paramQuery search - Free-text filter - @type(string)
   * @paramQuery status - active|draft|archived|all - @type(string)
   * @responseBody 200 - { "data": { "items": [{ "id": "uuid", "name": "Growth", "status": "active" }], "summary": { "total": 3, "active": 2 } } }
   * @responseBody 403 - { "error": "Permission denied: platform:tenants_billing", "code": "PERMISSION_DENIED" }
   */
  @inject()
  async index({ bouncer, request, serialize }: HttpContext, plans: PlanService) {
    await bouncer.with(SuperAdminPolicy).authorize('manageBilling')

    const params = await request.validateUsing(listSuperAdminPlansValidator, {
      data: request.qs(),
    })

    const result = await plans.listPlans({
      search: params.search,
      status: params.status,
    })

    return serialize(result)
  }

  /**
   * @summary Create a billing plan (Super Admin)
   * @description Creates a local plans catalog row only. Razorpay plan ids are created later at tenant checkout.
   * @tag Super Admin
   * @security BearerAuth
   * @requestBody { "name": "Growth", "price": 2499, "currency": "INR", "billingPeriod": "monthly", "status": "active", "limits": {} }
   * @responseBody 200 - { "data": { "id": "uuid", "name": "Growth", "status": "active", "gatewayPlanId": null } }
   * @responseBody 403 - { "error": "Permission denied: platform:tenants_billing", "code": "PERMISSION_DENIED" }
   * @responseBody 409 - { "error": "An active plan with the same name, billing interval, price, and currency already exists", "code": "E_PLAN_DUPLICATE_ACTIVE" }
   */
  @inject()
  async store({ bouncer, request, serialize }: HttpContext, plans: PlanService) {
    await bouncer.with(SuperAdminPolicy).authorize('manageBilling')

    const payload = await request.validateUsing(createSuperAdminPlanValidator)
    const plan = await plans.createPlan(payload, request.authUser!.id)

    return serialize(plan)
  }

  /**
   * @summary Get a billing plan (Super Admin)
   * @tag Super Admin
   * @security BearerAuth
   * @paramPath id - Plan id - @type(string)
   * @responseBody 200 - { "data": { "id": "uuid", "name": "Growth" } }
   * @responseBody 404 - { "error": "Plan Not Found", "code": "E_PLAN_NOT_FOUND" }
   */
  @inject()
  async show({ bouncer, request, params, serialize }: HttpContext, plans: PlanService) {
    await bouncer.with(SuperAdminPolicy).authorize('manageBilling')

    const { id } = await request.validateUsing(planIdParamValidator, {
      data: params,
    })

    const plan = await plans.getPlan(id)
    return serialize(plan)
  }

  /**
   * @summary Update a billing plan (Super Admin)
   * @description Partial local catalog update. Pricing/interval changes clear any stored Razorpay plan id so the next checkout re-syncs.
   * @tag Super Admin
   * @security BearerAuth
   * @paramPath id - Plan id - @type(string)
   * @responseBody 200 - { "data": { "id": "uuid", "name": "Growth" } }
   * @responseBody 404 - { "error": "Plan Not Found", "code": "E_PLAN_NOT_FOUND" }
   * @responseBody 409 - { "error": "An active plan with the same name, billing interval, price, and currency already exists", "code": "E_PLAN_DUPLICATE_ACTIVE" }
   */
  @inject()
  async update({ bouncer, request, params, serialize }: HttpContext, plans: PlanService) {
    await bouncer.with(SuperAdminPolicy).authorize('manageBilling')

    const { id } = await request.validateUsing(planIdParamValidator, {
      data: params,
    })
    const payload = await request.validateUsing(updateSuperAdminPlanValidator)
    const plan = await plans.updatePlan(id, payload, request.authUser!.id)

    return serialize(plan)
  }

  /**
   * @summary Archive (soft-deactivate) a billing plan (Super Admin)
   * @description Sets status=archived and isActive=false. Does not call Razorpay.
   * @tag Super Admin
   * @security BearerAuth
   * @paramPath id - Plan id - @type(string)
   * @responseBody 200 - { "data": { "id": "uuid", "status": "archived" } }
   * @responseBody 404 - { "error": "Plan Not Found", "code": "E_PLAN_NOT_FOUND" }
   * @responseBody 409 - { "error": "Plan is already archived", "code": "E_PLAN_ALREADY_ARCHIVED" }
   */
  @inject()
  async softDelete({ bouncer, request, params, serialize }: HttpContext, plans: PlanService) {
    await bouncer.with(SuperAdminPolicy).authorize('manageBilling')

    const { id } = await request.validateUsing(planIdParamValidator, {
      data: params,
    })

    const plan = await plans.archivePlan(id, request.authUser!.id)
    return serialize(plan)
  }
}
