import IntegrationConnectionException from '#exceptions/integration_connection_exception'
import {
  IntegrationConnectionRepository,
  type IntegrationConnectionProvider,
  type IntegrationConnectionRow,
} from '#repositories/integration_connection_repository'
import { PlanEnforcementService } from '#services/billing/plan_enforcement_service'

const MANAGED_PROVIDER: IntegrationConnectionProvider = 'shopenup'
const SECRET_CONFIG_KEY = /secret|token|password|credential|api[_-]?key/i

export class IntegrationConnectionService {
  constructor(
    private connections: IntegrationConnectionRepository = new IntegrationConnectionRepository()
  ) {}

  async list(organizationId: string): Promise<IntegrationConnectionRow[]> {
    return this.connections.listForOrg(organizationId)
  }

  async get(params: {
    organizationId: string
    provider: string
  }): Promise<IntegrationConnectionRow> {
    const provider = this.requireManagedProvider(params.provider)
    const row = await this.connections.findByProviderForOrg({
      organizationId: params.organizationId,
      provider,
    })
    if (!row) {
      throw IntegrationConnectionException.notFound()
    }
    return row
  }

  async upsert(params: {
    organizationId: string
    provider: string
    displayName: string
    externalAccountId?: string | null
    config?: Record<string, unknown>
  }): Promise<IntegrationConnectionRow> {
    const provider = this.requireManagedProvider(params.provider)
    if (params.config) {
      this.assertConfigHasNoSecrets(params.config)
    }

    await new PlanEnforcementService().requireFeature(
      params.organizationId,
      'eCommerceIntegrations'
    )

    const existing = await this.connections.findByProviderForOrg({
      organizationId: params.organizationId,
      provider,
    })
    if (!existing) {
      const connections = await this.connections.listForOrg(params.organizationId)
      await new PlanEnforcementService().requireUnderLimit(
        params.organizationId,
        'maxStoreConnections',
        connections.length
      )
    }

    return this.connections.upsertForOrg({
      organizationId: params.organizationId,
      provider,
      displayName: params.displayName,
      externalAccountId: params.externalAccountId,
      config: params.config,
      status: 'connected',
    })
  }

  async delete(params: { organizationId: string; provider: string }): Promise<void> {
    const provider = this.requireManagedProvider(params.provider)
    const deleted = await this.connections.deleteByProviderForOrg({
      organizationId: params.organizationId,
      provider,
    })
    if (!deleted) {
      throw IntegrationConnectionException.notFound()
    }
  }

  private requireManagedProvider(provider: string): IntegrationConnectionProvider {
    if (provider !== MANAGED_PROVIDER) {
      throw IntegrationConnectionException.unsupportedProvider(provider)
    }
    return MANAGED_PROVIDER
  }

  private assertConfigHasNoSecrets(config: Record<string, unknown>) {
    for (const key of Object.keys(config)) {
      if (SECRET_CONFIG_KEY.test(key)) {
        throw IntegrationConnectionException.configContainsSecret()
      }
    }
  }
}
