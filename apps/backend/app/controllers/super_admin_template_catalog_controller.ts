import type { HttpContext } from '@adonisjs/core/http'
import SuperAdminPolicy from '#policies/super_admin_policy'
import { PlatformTemplateCatalogService } from '#services/platform_template_catalog_service'
import {
  catalogIdParamValidator,
  createPlatformTemplateCatalogValidator,
  importTemplateCatalogValidator,
  listMetaTemplateLibraryValidator,
  listPlatformTemplateCatalogValidator,
  updatePlatformTemplateCatalogValidator,
} from '#validators/platform_template_catalog'
import type { MetaTemplateLibraryItem } from '#lib/meta_whatsapp/types'
import '#types/http'

export default class SuperAdminTemplateCatalogController {
  /**
   * @indexLibrary
   * @summary Browse Meta Template Library
   * @description Proxies GET /message_template_library. Requires platform:config_view and META_SYSTEM_USER_ACCESS_TOKEN.
   * @tag Super-Admin
   * @security BearerAuth
   */
  async indexLibrary({ bouncer, request, serialize }: HttpContext) {
    await bouncer.with(SuperAdminPolicy).authorize('viewTemplateCatalog')
    const params = await request.validateUsing(listMetaTemplateLibraryValidator, {
      data: request.qs(),
    })
    const result = await new PlatformTemplateCatalogService().listLibrary(params)
    return serialize.withoutWrapping(result)
  }

  /**
   * @index
   * @summary List platform template catalog
   * @description Landlord catalog rows. Filters applied before pagination. Requires platform:config_view.
   * @tag Super-Admin
   * @security BearerAuth
   */
  async index({ bouncer, request, serialize }: HttpContext) {
    await bouncer.with(SuperAdminPolicy).authorize('viewTemplateCatalog')
    const params = await request.validateUsing(listPlatformTemplateCatalogValidator, {
      data: request.qs(),
    })
    return serialize.withoutWrapping(await new PlatformTemplateCatalogService().list(params))
  }

  /**
   * @store
   * @summary Create a manual catalog template
   * @tag Super-Admin
   * @security BearerAuth
   */
  async store({ bouncer, request, serialize }: HttpContext) {
    await bouncer.with(SuperAdminPolicy).authorize('manageTemplateCatalog')
    const payload = await request.validateUsing(createPlatformTemplateCatalogValidator)
    const row = await new PlatformTemplateCatalogService().createManual(
      payload,
      request.authUser!.id
    )
    return serialize(row)
  }

  /**
   * @importItems
   * @summary Import Meta Template Library items into the catalog
   * @tag Super-Admin
   * @security BearerAuth
   */
  async importItems({ bouncer, request, serialize }: HttpContext) {
    await bouncer.with(SuperAdminPolicy).authorize('manageTemplateCatalog')
    const payload = await request.validateUsing(importTemplateCatalogValidator)
    const result = await new PlatformTemplateCatalogService().importLibraryItems(
      payload.items as MetaTemplateLibraryItem[],
      request.authUser!.id
    )
    return serialize(result)
  }

  /**
   * @show
   * @summary Get a catalog template
   * @tag Super-Admin
   * @security BearerAuth
   */
  async show({ bouncer, params, serialize }: HttpContext) {
    await bouncer.with(SuperAdminPolicy).authorize('viewTemplateCatalog')
    const { id } = await catalogIdParamValidator.validate(params)
    return serialize(await new PlatformTemplateCatalogService().getById(id))
  }

  /**
   * @update
   * @summary Update a catalog template
   * @tag Super-Admin
   * @security BearerAuth
   */
  async update({ bouncer, request, params, serialize }: HttpContext) {
    await bouncer.with(SuperAdminPolicy).authorize('manageTemplateCatalog')
    const { id } = await catalogIdParamValidator.validate(params)
    const payload = await request.validateUsing(updatePlatformTemplateCatalogValidator)
    return serialize(
      await new PlatformTemplateCatalogService().update(id, payload, request.authUser!.id)
    )
  }

  /**
   * @publish
   * @summary Publish a catalog template
   * @tag Super-Admin
   * @security BearerAuth
   */
  async publish({ bouncer, request, params, serialize }: HttpContext) {
    await bouncer.with(SuperAdminPolicy).authorize('manageTemplateCatalog')
    const { id } = await catalogIdParamValidator.validate(params)
    return serialize(await new PlatformTemplateCatalogService().publish(id, request.authUser!.id))
  }

  /**
   * @destroy
   * @summary Archive a catalog template
   * @tag Super-Admin
   * @security BearerAuth
   */
  async destroy({ bouncer, request, params, serialize }: HttpContext) {
    await bouncer.with(SuperAdminPolicy).authorize('manageTemplateCatalog')
    const { id } = await catalogIdParamValidator.validate(params)
    return serialize(await new PlatformTemplateCatalogService().archive(id, request.authUser!.id))
  }
}
