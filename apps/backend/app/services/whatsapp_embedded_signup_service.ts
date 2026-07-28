import db from '@adonisjs/lucid/services/db'
import env from '#start/env'
import WhatsappConfigException from '#exceptions/whatsapp_config_exception'
import { generateWhatsappRegistrationPin } from '#lib/meta_whatsapp/access_token_crypto'
import {
  createMetaGraphClient,
  MetaGraphApiError,
  type MetaGraphClient,
} from '#lib/meta_whatsapp/graph_client'
import {
  WhatsappConfigService,
  type WhatsappConfigDto,
  type WhatsappConfigStatus,
} from '#services/whatsapp_config_service'

export type EmbeddedSignupSession = {
  appId: string
  configId: string
  graphVersion: string
}

export type CompleteEmbeddedSignupInput = {
  code: string
  wabaId: string
  phoneNumberId: string
  businessId?: string
}

/**
 * Org-first Embedded Signup orchestration.
 * Graph I/O is delegated to MetaGraphClient; persistence to WhatsappConfigService.
 */
export class WhatsappEmbeddedSignupService {
  constructor(
    protected graphClient: MetaGraphClient = createMetaGraphClient(),
    protected configService: WhatsappConfigService = new WhatsappConfigService(graphClient)
  ) {}

  /**
   * Public SDK bootstrap values (no secrets). FE still may use NEXT_PUBLIC_* ;
   * this endpoint is the single server source of truth when preferred.
   */
  getSession(): EmbeddedSignupSession {
    return {
      appId: env.get('META_APP_ID'),
      configId: env.get('META_EMBEDDED_SIGNUP_CONFIG_ID'),
      graphVersion: env.get('META_GRAPH_API_VERSION'),
    }
  }

  /**
   * Exchange ES code → subscribe WABA → register phone → upsert whatsapp_configs.
   * Partial Meta failures still persist status=error when a token was obtained,
   * so the org can retry without repeating the popup when we add retry later.
   */
  async complete(params: {
    organizationId: string
    userId: string
    input: CompleteEmbeddedSignupInput
  }): Promise<WhatsappConfigDto> {
    await this.assertOrganizationActive(params.organizationId)

    let accessToken: string
    try {
      const token = await this.graphClient.exchangeEmbeddedSignupCode(params.input.code)
      accessToken = token.accessToken
    } catch (error) {
      throw this.mapGraphError(error)
    }

    let subscribed = false
    let registered = false
    let status: WhatsappConfigStatus = 'error'

    try {
      await this.graphClient.subscribeAppToWaba({
        wabaId: params.input.wabaId,
        accessToken,
      })
      subscribed = true

      const pin = generateWhatsappRegistrationPin()
      await this.graphClient.registerPhoneNumber({
        phoneNumberId: params.input.phoneNumberId,
        accessToken,
        pin,
      })
      registered = true
      status = 'connected'
    } catch (error) {
      // Persist partial state below, then surface Meta error to the client.
      await this.configService.upsertFromEmbeddedSignup({
        organizationId: params.organizationId,
        userId: params.userId,
        phoneNumberId: params.input.phoneNumberId,
        wabaId: params.input.wabaId,
        accessTokenPlain: accessToken,
        status: 'error',
        subscribed,
        registered,
      })
      throw this.mapGraphError(error)
    }

    return this.configService.upsertFromEmbeddedSignup({
      organizationId: params.organizationId,
      userId: params.userId,
      phoneNumberId: params.input.phoneNumberId,
      wabaId: params.input.wabaId,
      accessTokenPlain: accessToken,
      status,
      subscribed,
      registered,
    })
  }

  protected async assertOrganizationActive(organizationId: string): Promise<void> {
    const org = await db
      .from('organizations')
      .where('id', organizationId)
      .whereNull('deletedAt')
      .where('status', true)
      .select('id')
      .first()

    if (!org) {
      throw WhatsappConfigException.orgInactive()
    }
  }

  protected mapGraphError(error: unknown): WhatsappConfigException {
    if (error instanceof WhatsappConfigException) {
      return error
    }
    if (error instanceof MetaGraphApiError) {
      const status = error.status >= 400 && error.status < 500 ? 422 : 502
      return WhatsappConfigException.metaGraphFailed(error.message, status)
    }
    if (error instanceof Error) {
      return WhatsappConfigException.metaGraphFailed(error.message)
    }
    return WhatsappConfigException.metaGraphFailed('Meta Graph request failed')
  }
}
