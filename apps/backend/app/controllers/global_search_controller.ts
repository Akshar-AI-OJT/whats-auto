import type { HttpContext } from '@adonisjs/core/http'
import { GlobalSearchService } from '#services/global_search_service'
import { globalSearchQueryValidator } from '#validators/global_search'
import '#types/http'

export default class GlobalSearchController {
  /**
   * @index
   * @summary Global search for the active organization
   * @description Permission-aware search of tenant-owned records. Scope always comes from the authenticated organization — client organizationId is ignored.
   * @tag Search
   * @security BearerAuth
   * @paramQuery q - Search query (required, trimmed, case-insensitive partial match) - @type(string)
   * @responseBody 200 - { "data": { "query": "growth", "results": [{ "type": "contact", "id": "uuid", "title": "Priya Kapoor", "description": "Kapoor Interiors" }] } }
   * @responseBody 401 - { "error": "Missing or invalid session" }
   * @responseBody 403 - { "error": "No active organization. Call POST /api/v1/organizations/:id/set-active first.", "code": "NO_ACTIVE_ORG" }
   * @responseBody 422 - { "errors": [{ "message": "The q field must be at least 1 character", "field": "q" }] }
   */
  async index({ request, serialize }: HttpContext) {
    const { q } = await request.validateUsing(globalSearchQueryValidator, {
      data: request.qs(),
    })

    const result = await new GlobalSearchService().searchOrganization({
      query: q,
      organizationId: request.activeMember!.organizationId,
      permissions: request.memberPermissions,
    })

    return serialize(result)
  }
}
