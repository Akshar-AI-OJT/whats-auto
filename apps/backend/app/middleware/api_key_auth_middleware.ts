import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import ApiKeyException from '#exceptions/api_key_exception'
import { ApiKeyService } from '#services/integrations/api_key_service'
import { runWithTenant } from '#services/tenant_context'
import '#types/http'

export type ApiKeyAuthOptions = {
  requiredScopes?: string[]
}

/**
 * Public ingress auth: hash the bearer / x-api-key token, resolve via
 * SECURITY DEFINER, then bind tenant ALS before the rest of the stack.
 */
export default class ApiKeyAuthMiddleware {
  async handle(ctx: HttpContext, next: NextFn, options: ApiKeyAuthOptions = {}) {
    const rawToken = extractRawApiKey(ctx)
    if (!rawToken) {
      throw ApiKeyException.missing()
    }

    const apiKey = await new ApiKeyService().resolve(rawToken, options.requiredScopes)
    ctx.request.activeOrganizationId = apiKey.organizationId
    ctx.request.apiKeyId = apiKey.id

    return runWithTenant(apiKey.organizationId, () => next())
  }
}

function extractRawApiKey(ctx: HttpContext): string | null {
  const apiKeyHeader = ctx.request.header('x-api-key')?.trim()
  if (apiKeyHeader) {
    return apiKeyHeader
  }

  const authorization = ctx.request.header('authorization')
  if (!authorization) {
    return null
  }

  return authorization.replace(/^Bearer\s+/i, '').trim() || null
}
