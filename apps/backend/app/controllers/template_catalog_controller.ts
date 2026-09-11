import type { HttpContext } from '@adonisjs/core/http'
import TemplateCatalogPolicy from '#policies/template_catalog_policy'
import { PlatformTemplateCatalogService } from '#services/platform_template_catalog_service'
import {
  catalogIdParamValidator,
  listOrgTemplateCatalogValidator,
} from '#validators/platform_template_catalog'
import '#types/http'

export default class TemplateCatalogController {
  /**
   * @index
   * @summary List published platform templates
   * @description Landlord catalog visible to the active organization. Drafts are never returned.
   * @tag WhatsApp Templates
   * @security BearerAuth
   */
  async index({ bouncer, request, serialize }: HttpContext) {
    await bouncer.with(TemplateCatalogPolicy).authorize('viewList')
    const params = await request.validateUsing(listOrgTemplateCatalogValidator, {
      data: request.qs(),
    })
    return serialize.withoutWrapping(
      await new PlatformTemplateCatalogService().list({
        ...params,
        publishedOnly: true,
      })
    )
  }

  /**
   * @install
   * @summary Install a catalog template into the active organization
   * @tag WhatsApp Templates
   * @security BearerAuth
   */
  async install({ bouncer, request, params, serialize }: HttpContext) {
    await bouncer.with(TemplateCatalogPolicy).authorize('install')
    const { id } = await catalogIdParamValidator.validate(params)
    const template = await new PlatformTemplateCatalogService().installForOrganization({
      catalogId: id,
      organizationId: request.activeOrganizationId!,
      userId: request.authUser?.id,
    })
    return serialize(template)
  }
}
