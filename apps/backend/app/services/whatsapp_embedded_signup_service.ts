import db from '@adonisjs/lucid/services/db'
import logger from '@adonisjs/core/services/logger'
import env from '#start/env'
import WhatsappConfigException from '#exceptions/whatsapp_config_exception'
import { generateWhatsappRegistrationPin } from '#lib/meta_whatsapp/access_token_crypto'
import {
  createMetaGraphClient,
  MetaGraphApiError,
  type MetaGraphClient,
} from '#lib/meta_whatsapp/graph_client'
import { NotificationService } from '#services/notification_service'
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
      const previous = await db
        .from('whatsapp_configs')
        .where('organizationId', params.organizationId)
        .where('phoneNumberId', params.input.phoneNumberId)
        .select('status')
        .first()

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

      // Notify only on transition into error (skip retries that stay status=error).
      if ((previous?.status as string | undefined) !== 'error') {
        const detail = error instanceof Error ? error.message : 'WhatsApp connection failed'
        await this.#notifyOwnerConnectionErrorBestEffort({
          organizationId: params.organizationId,
          actorUserId: params.userId,
          phoneNumberId: params.input.phoneNumberId,
          detail,
        })
      }

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

  async #resolveOwnerUserId(organizationId: string): Promise<string | null> {
    const row = await db
      .from('organization_members')
      .join('roles', 'roles.id', 'organization_members.roleId')
      .where('organization_members.organizationId', organizationId)
      .where('roles.name', 'owner')
      .where('organization_members.isDeleted', false)
      .select('organization_members.userId')
      .first()

    return (row?.userId as string | undefined) ?? null
  }

  /**
   * Best-effort owner notification after WhatsApp config is persisted with status=error.
   * Never throws — connection-error persistence/throw path must not fail on notify.
   */
  async #notifyOwnerConnectionErrorBestEffort(params: {
    organizationId: string
    actorUserId: string
    phoneNumberId: string
    detail: string
  }): Promise<void> {
    try {
      const ownerUserId = await this.#resolveOwnerUserId(params.organizationId)
      if (!ownerUserId) {
        logger.warn(
          {
            organizationId: params.organizationId,
            type: 'whatsapp_connection_error',
          },
          'whatsapp.notification_skipped_no_owner'
        )
        return
      }

      await new NotificationService().createNotification({
        organizationId: params.organizationId,
        userId: ownerUserId,
        type: 'whatsapp_connection_error',
        title: 'WhatsApp connection failed',
        body: `WhatsApp connection failed for phone number ID ${params.phoneNumberId}: ${params.detail}`,
        actorUserId: params.actorUserId,
      })
    } catch (error) {
      logger.error(
        {
          organizationId: params.organizationId,
          type: 'whatsapp_connection_error',
          err: error instanceof Error ? error.message : 'unknown',
        },
        'whatsapp.notification_failed'
      )
    }
  }
}
