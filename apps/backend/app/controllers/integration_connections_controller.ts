import type { HttpContext } from '@adonisjs/core/http'
import IntegrationConnectionPolicy from '#policies/integration_connection_policy'
import { IntegrationConnectionService } from '#services/integrations/integration_connection_service'
import { transformIntegrationConnection } from '#transformers/integration_connection_transformer'
import {
  integrationProviderParamValidator,
  upsertIntegrationConnectionValidator,
} from '#validators/integration_connection'
import '#types/http'

export default class IntegrationConnectionsController {
  /**
   * @index
   * @summary List tenant integration connections
   * @description Redacted DTOs. encryptedSecret is never returned.
   * @tag Integrations
   * @security BearerAuth
   * @responseBody 200 - { "data": [{ "id": "uuid", "provider": "shopenup", "displayName": "Shopenup Production", "status": "connected" }] }
   * @responseBody 403 - { "error": "Permission denied: integrations:view", "code": "PERMISSION_DENIED" }
   */
  async index({ bouncer, request }: HttpContext) {
    await bouncer.with(IntegrationConnectionPolicy).authorize('viewList')

    const connections = await new IntegrationConnectionService().list(
      request.activeMember!.organizationId
    )
    return { data: connections.map((row) => transformIntegrationConnection(row)) }
  }

  /**
   * @show
   * @summary Get one integration connection by provider
   * @tag Integrations
   * @security BearerAuth
   * @paramPath provider - Provider key - @type(string)
   * @responseBody 200 - { "data": { "id": "uuid", "provider": "shopenup", "displayName": "Shopenup Production" } }
   * @responseBody 404 - { "error": "Integration connection not found", "code": "E_INTEGRATION_CONNECTION_NOT_FOUND" }
   * @responseBody 422 - { "error": "Provider \"shopify\" is not available", "code": "E_INTEGRATION_PROVIDER_UNSUPPORTED" }
   */
  async show({ bouncer, request, params, serialize }: HttpContext) {
    const { provider } = await request.validateUsing(integrationProviderParamValidator, {
      data: params,
    })

    await bouncer.with(IntegrationConnectionPolicy).authorize('view', {
      organizationId: request.activeMember!.organizationId,
    })

    const row = await new IntegrationConnectionService().get({
      organizationId: request.activeMember!.organizationId,
      provider,
    })
    return serialize(transformIntegrationConnection(row))
  }

  /**
   * @upsert
   * @summary Create or update a Shopenup connection
   * @description Unique per tenant+provider. Secrets are not accepted and never returned.
   * @tag Integrations
   * @security BearerAuth
   * @paramPath provider - Provider key - @type(string)
   * @requestBody { "displayName": "Shopenup Production", "externalAccountId": "store_1", "config": { "storeUrl": "https://shop.example.com" } }
   * @responseBody 200 - { "data": { "id": "uuid", "provider": "shopenup", "displayName": "Shopenup Production" } }
   * @responseBody 403 - { "error": "Permission denied: integrations:manage", "code": "PERMISSION_DENIED" }
   * @responseBody 422 - { "error": "Provider \"shopify\" is not available", "code": "E_INTEGRATION_PROVIDER_UNSUPPORTED" }
   */
  async upsert({ bouncer, request, params, serialize }: HttpContext) {
    const { provider } = await request.validateUsing(integrationProviderParamValidator, {
      data: params,
    })
    await bouncer.with(IntegrationConnectionPolicy).authorize('upsert')

    const payload = await request.validateUsing(upsertIntegrationConnectionValidator)
    const row = await new IntegrationConnectionService().upsert({
      organizationId: request.activeMember!.organizationId,
      provider,
      displayName: payload.displayName,
      externalAccountId: payload.externalAccountId,
      config: payload.config,
    })
    return serialize(transformIntegrationConnection(row))
  }

  /**
   * @destroy
   * @summary Delete a Shopenup connection
   * @tag Integrations
   * @security BearerAuth
   * @paramPath provider - Provider key - @type(string)
   * @responseBody 200 - { "data": { "ok": true } }
   * @responseBody 404 - { "error": "Integration connection not found", "code": "E_INTEGRATION_CONNECTION_NOT_FOUND" }
   */
  async destroy({ bouncer, request, params, serialize }: HttpContext) {
    const { provider } = await request.validateUsing(integrationProviderParamValidator, {
      data: params,
    })

    await bouncer.with(IntegrationConnectionPolicy).authorize('destroy', {
      organizationId: request.activeMember!.organizationId,
    })

    await new IntegrationConnectionService().delete({
      organizationId: request.activeMember!.organizationId,
      provider,
    })
    return serialize({ ok: true })
  }
}
