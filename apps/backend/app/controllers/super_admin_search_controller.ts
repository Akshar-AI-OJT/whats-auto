import type { HttpContext } from '@adonisjs/core/http'
import { accessPlatform } from '#abilities/main'
import { GlobalSearchService } from '#services/global_search_service'
import { globalSearchQueryValidator } from '#validators/global_search'
import '#types/http'

export default class SuperAdminSearchController {
  /**
   * @index
   * @summary Platform global search (Super Admin)
   * @description Searches authorized platform resources. Requires Super Admin / platform access. Does not use a tenant organization.
   * @tag Super-Admin
   * @security BearerAuth
   * @paramQuery q - Search query (required, trimmed, case-insensitive partial match) - @type(string)
   * @responseBody 200 - { "data": { "query": "growth", "results": [{ "type": "plan", "id": "uuid", "title": "Growth", "description": "growth · monthly · INR" }] } }
   * @responseBody 401 - { "error": "Missing or invalid session" }
   * @responseBody 403 - { "error": "Platform access required. Super Admin role is required.", "code": "PLATFORM_ACCESS_DENIED" }
   * @responseBody 422 - { "errors": [{ "message": "The q field must be at least 1 character", "field": "q" }] }
   */
  async index({ bouncer, request, serialize }: HttpContext) {
    await bouncer.authorize(accessPlatform)

    const { q } = await request.validateUsing(globalSearchQueryValidator, {
      data: request.qs(),
    })

    const result = await new GlobalSearchService().searchPlatform({
      query: q,
      permissions: request.memberPermissions,
    })

    return serialize(result)
  }
}
