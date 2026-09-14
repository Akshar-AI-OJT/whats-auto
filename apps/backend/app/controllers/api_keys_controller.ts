import type { HttpContext } from '@adonisjs/core/http'
import ApiKeyPolicy from '#policies/api_key_policy'
import { ApiKeyService } from '#services/integrations/api_key_service'
import { transformApiKey } from '#transformers/api_key_transformer'
import { apiKeyIdParamValidator, createApiKeyValidator } from '#validators/api_key'
import '#types/http'

export default class ApiKeysController {
  /**
   * @index
   * @summary List tenant API keys
   * @description Prefix, name, scopes, and lastUsedAt. The plaintext secret is never returned.
   * @tag Integrations
   * @security BearerAuth
   * @responseBody 200 - { "data": [{ "id": "uuid", "name": "Shopenup Production", "keyPrefix": "wta_live_7f8a2b3c", "scopes": ["events:write"] }] }
   * @responseBody 403 - { "error": "Permission denied: integrations:view", "code": "PERMISSION_DENIED" }
   */
  async index({ bouncer, request }: HttpContext) {
    await bouncer.with(ApiKeyPolicy).authorize('viewList')

    const keys = await new ApiKeyService().list(request.activeMember!.organizationId)
    return { data: keys.map((row) => transformApiKey(row)) }
  }

  /**
   * @store
   * @summary Create a tenant API key
   * @description Returns the plaintext secretToken once. Store it; it cannot be retrieved later.
   * @tag Integrations
   * @security BearerAuth
   * @requestBody { "name": "Shopenup Production", "scopes": ["events:write"] }
   * @responseBody 200 - { "data": { "id": "uuid", "name": "Shopenup Production", "keyPrefix": "wta_live_7f8a2b3c", "secretToken": "wta_live_7f8a2b3c_…" } }
   * @responseBody 403 - { "error": "Permission denied: integrations:manage", "code": "PERMISSION_DENIED" }
   */
  async store({ bouncer, request, serialize }: HttpContext) {
    await bouncer.with(ApiKeyPolicy).authorize('create')

    const payload = await request.validateUsing(createApiKeyValidator)
    const created = await new ApiKeyService().create({
      organizationId: request.activeMember!.organizationId,
      actorUserId: request.authUser!.id,
      name: payload.name,
      scopes: payload.scopes,
    })
    return serialize(transformApiKey(created.row, { secretToken: created.secretToken }))
  }

  /**
   * @revoke
   * @summary Revoke a tenant API key
   * @description Sets revokedAt. Ingress using this key fails immediately.
   * @tag Integrations
   * @security BearerAuth
   * @paramPath id - API key id - @type(string)
   * @responseBody 200 - { "data": { "id": "uuid", "revokedAt": "2026-08-17T12:00:00.000Z" } }
   * @responseBody 403 - { "error": "Permission denied: integrations:manage", "code": "PERMISSION_DENIED" }
   * @responseBody 404 - { "error": "API key not found", "code": "E_API_KEY_NOT_FOUND" }
   */
  async revoke({ bouncer, request, params, serialize }: HttpContext) {
    const { id } = await request.validateUsing(apiKeyIdParamValidator, {
      data: params,
    })

    await bouncer.with(ApiKeyPolicy).authorize('revoke', {
      organizationId: request.activeMember!.organizationId,
      id,
    })

    const row = await new ApiKeyService().revoke({
      organizationId: request.activeMember!.organizationId,
      id,
    })
    return serialize(transformApiKey(row))
  }
}
