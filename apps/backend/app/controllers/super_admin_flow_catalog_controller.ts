import type { HttpContext } from '@adonisjs/core/http'
import SuperAdminPolicy from '#policies/super_admin_policy'
import { PlatformFlowCatalogService } from '#services/platform_flow_catalog_service'
import {
  catalogFlowIdParamValidator,
  createPlatformFlowCatalogValidator,
  listPlatformFlowCatalogValidator,
  updatePlatformFlowCatalogValidator,
  validatePlatformFlowCatalogValidator,
} from '#validators/platform_flow_catalog'
import '#types/http'

export default class SuperAdminFlowCatalogController {
  /**
   * @index
   * @summary List platform flow catalog
   * @tag Super-Admin
   * @security BearerAuth
   */
  async index({ bouncer, request, serialize }: HttpContext) {
    await bouncer.with(SuperAdminPolicy).authorize('viewFlowCatalog')
    const params = await request.validateUsing(listPlatformFlowCatalogValidator, {
      data: request.qs(),
    })
    return serialize.withoutWrapping(await new PlatformFlowCatalogService().list(params))
  }

  /**
   * @store
   * @summary Create a draft catalog flow
   * @tag Super-Admin
   * @security BearerAuth
   */
  async store({ bouncer, request, serialize }: HttpContext) {
    await bouncer.with(SuperAdminPolicy).authorize('manageFlowCatalog')
    const payload = await request.validateUsing(createPlatformFlowCatalogValidator)
    return serialize(
      await new PlatformFlowCatalogService().create({
        actorUserId: request.authUser!.id,
        ...payload,
      })
    )
  }

  /**
   * @show
   * @summary Get a catalog flow
   * @tag Super-Admin
   * @security BearerAuth
   */
  async show({ bouncer, params, serialize }: HttpContext) {
    await bouncer.with(SuperAdminPolicy).authorize('viewFlowCatalog')
    const { id } = await catalogFlowIdParamValidator.validate(params)
    return serialize(await new PlatformFlowCatalogService().getById(id))
  }

  /**
   * @update
   * @summary Update a catalog flow
   * @tag Super-Admin
   * @security BearerAuth
   */
  async update({ bouncer, request, params, serialize }: HttpContext) {
    await bouncer.with(SuperAdminPolicy).authorize('manageFlowCatalog')
    const { id } = await catalogFlowIdParamValidator.validate(params)
    const payload = await request.validateUsing(updatePlatformFlowCatalogValidator)
    return serialize(
      await new PlatformFlowCatalogService().update({
        id,
        actorUserId: request.authUser!.id,
        name: payload.name,
        description: payload.description,
        triggerType: payload.triggerType,
        triggerConfig: payload.triggerConfig,
        settings: payload.settings,
        extraRequiredFeatureKeys: payload.extraRequiredFeatureKeys,
        sortOrder: payload.sortOrder,
        nodes: payload.nodes?.map((node) => ({
          ...node,
          data: node.data ?? {},
        })),
        edges: payload.edges,
        viewport: payload.viewport,
      })
    )
  }

  /**
   * @validate
   * @summary Validate a catalog flow graph
   * @tag Super-Admin
   * @security BearerAuth
   */
  async validate({ bouncer, request, params, serialize }: HttpContext) {
    await bouncer.with(SuperAdminPolicy).authorize('viewFlowCatalog')
    const { id } = await catalogFlowIdParamValidator.validate(params)
    const payload = await request.validateUsing(validatePlatformFlowCatalogValidator)
    return serialize(
      await new PlatformFlowCatalogService().validate({
        id,
        nodes: payload.nodes?.map((node) => ({
          ...node,
          data: node.data ?? {},
        })),
        edges: payload.edges,
        viewport: payload.viewport,
      })
    )
  }

  /**
   * @publish
   * @summary Publish a catalog flow
   * @tag Super-Admin
   * @security BearerAuth
   */
  async publish({ bouncer, request, params, serialize }: HttpContext) {
    await bouncer.with(SuperAdminPolicy).authorize('manageFlowCatalog')
    const { id } = await catalogFlowIdParamValidator.validate(params)
    return serialize(await new PlatformFlowCatalogService().publish(id, request.authUser!.id))
  }

  /**
   * @destroy
   * @summary Archive a catalog flow
   * @tag Super-Admin
   * @security BearerAuth
   */
  async destroy({ bouncer, request, params, serialize }: HttpContext) {
    await bouncer.with(SuperAdminPolicy).authorize('manageFlowCatalog')
    const { id } = await catalogFlowIdParamValidator.validate(params)
    return serialize(await new PlatformFlowCatalogService().archive(id, request.authUser!.id))
  }
}
