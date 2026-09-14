import db from '@adonisjs/lucid/services/db'
import logger from '@adonisjs/core/services/logger'
import env from '#start/env'
import { OrganizationStatus } from '#enums/organization_status'
import WhatsappConfigException from '#exceptions/whatsapp_config_exception'
import { insertAuthorizationAudit } from '#lib/authorization_audit'
import { generateWhatsappRegistrationPin } from '#lib/meta_whatsapp/access_token_crypto'
import {
  createMetaGraphClient,
  MetaGraphApiError,
  type MetaGraphClient,
} from '#lib/meta_whatsapp/graph_client'
import { NotificationService } from '#services/notification_service'
import { OrganizationService } from '#services/organization_service'
import { WhatsappConfigService, type WhatsappConfigDto } from '#services/whatsapp_config_service'

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

const META_VERIFICATION_HELP_URL = 'https://business.facebook.com/settings/security'

/**
 * Org-first Embedded Signup orchestration ([D70]).
 * Exchange → resolve/validate Meta portfolio → subscribe/register → verified_setup.
 */
export class WhatsappEmbeddedSignupService {
  constructor(
    protected graphClient: MetaGraphClient = createMetaGraphClient(),
    protected configService: WhatsappConfigService = new WhatsappConfigService(graphClient)
  ) {}

  getSession(): EmbeddedSignupSession {
    return {
      appId: env.get('META_APP_ID'),
      configId: env.get('META_EMBEDDED_SIGNUP_CONFIG_ID'),
      graphVersion: env.get('META_GRAPH_API_VERSION'),
    }
  }

  async complete(params: {
    organizationId: string
    userId: string
    input: CompleteEmbeddedSignupInput
  }): Promise<WhatsappConfigDto> {
    await this.assertOrganizationEligible(params.organizationId)

    const phoneNumberId = params.input.phoneNumberId?.trim()
    const wabaId = params.input.wabaId?.trim()
    if (!phoneNumberId || !wabaId) {
      throw WhatsappConfigException.phoneRequired()
    }

    let accessToken: string
    try {
      const token = await this.graphClient.exchangeEmbeddedSignupCode(params.input.code)
      accessToken = token.accessToken
    } catch (error) {
      throw this.mapGraphError(error)
    }

    let businessId = params.input.businessId?.trim() || null
    let verificationStatus: string | null = null

    try {
      if (!businessId) {
        const waba = await this.graphClient.getWaba({ wabaId, accessToken })
        businessId = waba.ownerBusinessId ?? null
        if (!businessId) {
          throw WhatsappConfigException.metaAccountUnusable(
            'Could not resolve a Meta Business Portfolio for this WhatsApp account.',
            { wabaId }
          )
        }
      }

      const portfolio = await this.graphClient.getBusinessPortfolio({
        businessId,
        accessToken,
      })
      verificationStatus = portfolio.verificationStatus?.toLowerCase() ?? null

      if (!verificationStatus) {
        throw WhatsappConfigException.metaAccountUnusable(
          'Meta did not return a Business Portfolio verification status.',
          { businessId }
        )
      }

      if (verificationStatus !== 'verified') {
        await this.configService.upsertFromEmbeddedSignup({
          organizationId: params.organizationId,
          userId: params.userId,
          phoneNumberId,
          wabaId,
          businessId,
          metaVerificationStatus: verificationStatus,
          accessTokenPlain: accessToken,
          status: 'error',
          subscribed: false,
          registered: false,
        })
        throw WhatsappConfigException.metaPortfolioUnverified({
          businessId,
          verificationStatus,
          helpUrl: META_VERIFICATION_HELP_URL,
        })
      }
    } catch (error) {
      if (error instanceof WhatsappConfigException) {
        throw error
      }
      if (error instanceof MetaGraphApiError) {
        await this.#persistErrorConfigBestEffort({
          organizationId: params.organizationId,
          userId: params.userId,
          phoneNumberId,
          wabaId,
          businessId,
          metaVerificationStatus: verificationStatus,
          accessToken,
        })
        throw WhatsappConfigException.metaAccountUnusable(
          error.message ||
            'No valid Meta Business Portfolio could be linked. Create or select a portfolio in Embedded Signup and try again.',
          { wabaId, businessId: businessId ?? undefined }
        )
      }
      throw this.mapGraphError(error)
    }

    let subscribed = false
    let registered = false

    try {
      await this.graphClient.subscribeAppToWaba({ wabaId, accessToken })
      subscribed = true

      const pin = generateWhatsappRegistrationPin()
      await this.graphClient.registerPhoneNumber({
        phoneNumberId,
        accessToken,
        pin,
      })
      registered = true
    } catch (error) {
      const previous = await db
        .from('whatsapp_configs')
        .where('organizationId', params.organizationId)
        .where('phoneNumberId', phoneNumberId)
        .select('status')
        .first()

      await this.configService.upsertFromEmbeddedSignup({
        organizationId: params.organizationId,
        userId: params.userId,
        phoneNumberId,
        wabaId,
        businessId,
        metaVerificationStatus: verificationStatus,
        accessTokenPlain: accessToken,
        status: 'error',
        subscribed,
        registered,
      })

      if ((previous?.status as string | undefined) !== 'error') {
        const detail = error instanceof Error ? error.message : 'WhatsApp connection failed'
        await this.#notifyOwnerConnectionErrorBestEffort({
          organizationId: params.organizationId,
          actorUserId: params.userId,
          phoneNumberId,
          detail,
        })
      }

      throw this.mapGraphError(error)
    }

    const dto = await this.configService.upsertFromEmbeddedSignup({
      organizationId: params.organizationId,
      userId: params.userId,
      phoneNumberId,
      wabaId,
      businessId,
      metaVerificationStatus: verificationStatus,
      accessTokenPlain: accessToken,
      status: 'connected',
      subscribed: true,
      registered: true,
    })

    await new OrganizationService().promoteToVerifiedSetup(params.organizationId)

    try {
      await insertAuthorizationAudit({
        organizationId: params.organizationId,
        actorUserId: params.userId,
        targetType: 'organization',
        targetId: params.organizationId,
        eventType: 'organization.whatsapp_verified',
        after: {
          businessId,
          wabaId,
          phoneNumberId,
          verificationStatus,
        },
      })
    } catch (error) {
      logger.warn(
        {
          organizationId: params.organizationId,
          err: error instanceof Error ? error.message : 'unknown',
        },
        'whatsapp.audit_whatsapp_verified_failed'
      )
    }

    return dto
  }

  /**
   * Allow Embedded Signup for unpaid setup and already-active orgs (reconnect).
   */
  protected async assertOrganizationEligible(organizationId: string): Promise<void> {
    const org = await db
      .from('organizations')
      .where('id', organizationId)
      .whereNull('deletedAt')
      .whereIn('status', [
        OrganizationStatus.PENDING_SETUP,
        OrganizationStatus.VERIFIED_SETUP,
        OrganizationStatus.ACTIVE,
      ])
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

  async #persistErrorConfigBestEffort(params: {
    organizationId: string
    userId: string
    phoneNumberId: string
    wabaId: string
    businessId: string | null
    metaVerificationStatus: string | null
    accessToken: string
  }): Promise<void> {
    try {
      await this.configService.upsertFromEmbeddedSignup({
        organizationId: params.organizationId,
        userId: params.userId,
        phoneNumberId: params.phoneNumberId,
        wabaId: params.wabaId,
        businessId: params.businessId,
        metaVerificationStatus: params.metaVerificationStatus,
        accessTokenPlain: params.accessToken,
        status: 'error',
        subscribed: false,
        registered: false,
      })
    } catch (error) {
      logger.warn(
        {
          organizationId: params.organizationId,
          err: error instanceof Error ? error.message : 'unknown',
        },
        'whatsapp.persist_error_config_failed'
      )
    }
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
