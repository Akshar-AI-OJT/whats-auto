import type { HttpContext } from '@adonisjs/core/http'
import FlowCatalogPolicy from '#policies/flow_catalog_policy'
import { PlatformFlowCatalogService } from '#services/platform_flow_catalog_service'
import {
  catalogFlowIdParamValidator,
  listOrgFlowCatalogValidator,
} from '#validators/platform_flow_catalog'
import '#types/http'

export default class FlowCatalogController {
  /**
   * @index
   * @summary List published catalog flows visible on the current plan
   * @tag Flows
   * @security BearerAuth
   */
  async index({ bouncer, request, serialize }: HttpContext) {
    await bouncer.with(FlowCatalogPolicy).authorize('viewList')
    const params = await request.validateUsing(listOrgFlowCatalogValidator, {
      data: request.qs(),
    })
    return serialize.withoutWrapping(
      await new PlatformFlowCatalogService().listForOrganization({
        organizationId: request.activeOrganizationId!,
        ...params,
      })
    )
  }

  /**
   * @install
   * @summary Install a catalog flow as a draft organization flow
   * @tag Flows
   * @security BearerAuth
   */
  async install({ bouncer, request, params, serialize }: HttpContext) {
    await bouncer.with(FlowCatalogPolicy).authorize('install')
    const { id } = await catalogFlowIdParamValidator.validate(params)
    const flow = await new PlatformFlowCatalogService().installForOrganization({
      catalogId: id,
      organizationId: request.activeOrganizationId!,
      userId: request.authUser?.id,
    })
    return serialize(flow)
  }
}
