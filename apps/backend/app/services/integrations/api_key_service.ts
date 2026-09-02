import ApiKeyException from '#exceptions/api_key_exception'
import { generateApiKey, hashApiKey } from '#lib/integrations/api_key_crypto'
import {
  ApiKeyRepository,
  type ApiKeyRow,
  type ResolvedApiKey,
} from '#repositories/api_key_repository'
import { PlanEnforcementService } from '#services/billing/plan_enforcement_service'

const DEFAULT_SCOPES = ['events:write'] as const

export class ApiKeyService {
  constructor(private keys: ApiKeyRepository = new ApiKeyRepository()) {}

  async list(organizationId: string): Promise<ApiKeyRow[]> {
    return this.keys.listForOrg(organizationId)
  }

  async create(params: {
    organizationId: string
    actorUserId: string
    name: string
    scopes?: string[]
  }): Promise<{ row: ApiKeyRow; secretToken: string }> {
    await new PlanEnforcementService().requireFeature(params.organizationId, 'apiAccess')

    const existing = await this.keys.listForOrg(params.organizationId)
    const activeCount = existing.filter((key) => !key.revokedAt).length
    await new PlanEnforcementService().requireUnderLimit(
      params.organizationId,
      'maxApiKeys',
      activeCount
    )

    const generated = generateApiKey()
    const row = await this.keys.insert({
      organizationId: params.organizationId,
      createdByUserId: params.actorUserId,
      name: params.name,
      keyPrefix: generated.keyPrefix,
      keyHash: generated.keyHash,
      scopes: params.scopes?.length ? params.scopes : [...DEFAULT_SCOPES],
    })
    return { row, secretToken: generated.rawToken }
  }

  async revoke(params: { organizationId: string; id: string }): Promise<ApiKeyRow> {
    const row = await this.keys.revokeForOrg({
      organizationId: params.organizationId,
      id: params.id,
    })
    if (!row) {
      throw ApiKeyException.notFound()
    }
    return row
  }

  /**
   * Public ingress lookup. Does not require runWithTenant (SECURITY DEFINER).
   */
  async resolve(
    rawToken: string,
    requiredScopes: string[] = [...DEFAULT_SCOPES]
  ): Promise<ResolvedApiKey> {
    const keyHash = hashApiKey(rawToken)
    const apiKey = await this.keys.resolveByHash(keyHash)

    if (
      !apiKey ||
      apiKey.revokedAt ||
      (apiKey.expiresAt && new Date(apiKey.expiresAt).getTime() <= Date.now())
    ) {
      throw ApiKeyException.invalid()
    }

    const hasRequiredScopes = requiredScopes.every((scope) => apiKey.scopes.includes(scope))
    if (!hasRequiredScopes) {
      throw ApiKeyException.insufficientScope()
    }

    return apiKey
  }
}
