import db from '@adonisjs/lucid/services/db'
import WhatsappConfigException from '#exceptions/whatsapp_config_exception'
import {
  decryptWhatsappAccessToken,
  encryptWhatsappAccessToken,
} from '#lib/meta_whatsapp/access_token_crypto'
import { createMetaGraphClient, type MetaGraphClient } from '#lib/meta_whatsapp/graph_client'

export type WhatsappConfigStatus = 'connected' | 'disconnected' | 'error'

/** Public DTO — never includes accessToken. */
export type WhatsappConfigDto = {
  id: string
  organizationId: string
  phoneNumberId: string
  wabaId: string | null
  status: WhatsappConfigStatus
  connectedAt: string | null
  registeredAt: string | null
  subscribedAppsAt: string | null
  createdByUserId: string | null
  createdAt: string
  updatedAt: string | null
}

type WhatsappConfigRow = {
  id: string
  organizationId: string
  phoneNumberId: string
  wabaId: string | null
  accessToken: string
  status: string
  connectedAt: string | null
  registeredAt: string | null
  subscribedAppsAt: string | null
  createdByUserId: string | null
  createdAt: string
  updatedAt: string | null
}

/**
 * Tenant WhatsApp number configs. Filters by organizationId in app code
 * (defense in depth) + Postgres RLS. Token decrypt is internal-only for Graph calls.
 */
export class WhatsappConfigService {
  constructor(protected graphClient: MetaGraphClient = createMetaGraphClient()) {}

  toDto(row: WhatsappConfigRow): WhatsappConfigDto {
    return {
      id: row.id,
      organizationId: row.organizationId,
      phoneNumberId: row.phoneNumberId,
      wabaId: row.wabaId,
      status: row.status as WhatsappConfigStatus,
      connectedAt: row.connectedAt,
      registeredAt: row.registeredAt,
      subscribedAppsAt: row.subscribedAppsAt,
      createdByUserId: row.createdByUserId,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }
  }

  /**
   * Filters by organizationId in app code (defense in depth) + RLS.
   */
  async listConfigs(organizationId: string): Promise<WhatsappConfigDto[]> {
    const rows = await db
      .from('whatsapp_configs')
      .where('organizationId', organizationId)
      .select(
        'id',
        'organizationId',
        'phoneNumberId',
        'wabaId',
        'status',
        'connectedAt',
        'registeredAt',
        'subscribedAppsAt',
        'createdByUserId',
        'createdAt',
        'updatedAt'
      )
      .orderBy('createdAt', 'desc')

    return rows.map((r) =>
      this.toDto({
        ...(r as WhatsappConfigRow),
        accessToken: '',
      })
    )
  }

  async getConfig(configId: string, organizationId: string): Promise<WhatsappConfigDto> {
    const row = await this.findRowOrFail(configId, organizationId)
    return this.toDto({ ...row, accessToken: '' })
  }

  /**
   * Internal: decrypt token for outbound Graph calls (send, media, templates).
   * Call under runWithTenant / RLS; optional organizationId for defense in depth.
   */
  async getDecryptedAccessToken(
    configId: string,
    organizationId?: string
  ): Promise<{
    config: WhatsappConfigDto
    accessToken: string
  }> {
    const row = await this.findRowOrFail(configId, organizationId)
    return {
      config: this.toDto(row),
      accessToken: decryptWhatsappAccessToken(row.accessToken),
    }
  }

  /**
   * Upsert by phoneNumberId within the active tenant.
   * Global unique on phoneNumberId → 409 if another org already owns the number.
   */
  async upsertFromEmbeddedSignup(params: {
    organizationId: string
    userId: string
    phoneNumberId: string
    wabaId: string
    accessTokenPlain: string
    status: WhatsappConfigStatus
    subscribed: boolean
    registered: boolean
  }): Promise<WhatsappConfigDto> {
    const encrypted = encryptWhatsappAccessToken(params.accessTokenPlain)
    const now = new Date()

    try {
      return await db.transaction(async (trx) => {
        const existing = await trx
          .from('whatsapp_configs')
          .where('phoneNumberId', params.phoneNumberId)
          .first()

        if (existing && existing.organizationId !== params.organizationId) {
          // Visible under RLS only if same tenant; defensive for tests without RLS.
          throw WhatsappConfigException.phoneNumberOwnedByAnotherOrg()
        }

        const payload = {
          organizationId: params.organizationId,
          phoneNumberId: params.phoneNumberId,
          wabaId: params.wabaId,
          accessToken: encrypted,
          status: params.status,
          connectedAt: params.status === 'connected' ? now : (existing?.connectedAt ?? null),
          subscribedAppsAt: params.subscribed ? now : (existing?.subscribedAppsAt ?? null),
          registeredAt: params.registered ? now : (existing?.registeredAt ?? null),
          createdByUserId: params.userId,
        }

        if (existing) {
          const [row] = await trx
            .from('whatsapp_configs')
            .where('id', existing.id)
            .update(payload)
            .returning([
              'id',
              'organizationId',
              'phoneNumberId',
              'wabaId',
              'status',
              'connectedAt',
              'registeredAt',
              'subscribedAppsAt',
              'createdByUserId',
              'createdAt',
              'updatedAt',
            ])
          return this.toDto({ ...(row as WhatsappConfigRow), accessToken: '' })
        }

        const [row] = await trx
          .table('whatsapp_configs')
          .insert(payload)
          .returning([
            'id',
            'organizationId',
            'phoneNumberId',
            'wabaId',
            'status',
            'connectedAt',
            'registeredAt',
            'subscribedAppsAt',
            'createdByUserId',
            'createdAt',
            'updatedAt',
          ])
        return this.toDto({ ...(row as WhatsappConfigRow), accessToken: '' })
      })
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw WhatsappConfigException.phoneNumberOwnedByAnotherOrg()
      }
      throw error
    }
  }

  /**
   * Mark disconnected. Keeps encrypted token so a future reconnect/retry can
   * re-subscribe without forcing a full Embedded Signup (product can clear later).
   */
  async disconnect(configId: string, organizationId: string): Promise<WhatsappConfigDto> {
    const existing = await this.findRowOrFail(configId, organizationId)
    const [row] = await db
      .from('whatsapp_configs')
      .where('id', existing.id)
      .where('organizationId', organizationId)
      .update({ status: 'disconnected' })
      .returning([
        'id',
        'organizationId',
        'phoneNumberId',
        'wabaId',
        'status',
        'connectedAt',
        'registeredAt',
        'subscribedAppsAt',
        'createdByUserId',
        'createdAt',
        'updatedAt',
      ])

    return this.toDto({ ...(row as WhatsappConfigRow), accessToken: '' })
  }

  /**
   * Smoke-send a template message via Cloud API (optional Phase 2 verify).
   */
  async sendTestTemplate(params: {
    configId: string
    organizationId: string
    to: string
    templateName?: string
    languageCode?: string
  }): Promise<{ messageId?: string }> {
    const { config, accessToken } = await this.getDecryptedAccessToken(
      params.configId,
      params.organizationId
    )
    if (config.status !== 'connected') {
      throw WhatsappConfigException.notConnected()
    }

    const result = await this.graphClient.sendTemplateMessage({
      phoneNumberId: config.phoneNumberId,
      accessToken,
      to: params.to,
      templateName: params.templateName ?? 'hello_world',
      languageCode: params.languageCode ?? 'en_US',
    })

    return { messageId: result.messageId }
  }

  protected async findRowOrFail(
    configId: string,
    organizationId?: string
  ): Promise<WhatsappConfigRow> {
    const query = db.from('whatsapp_configs').where('id', configId)
    if (organizationId) {
      query.where('organizationId', organizationId)
    }
    const row = await query.first()
    if (!row) {
      throw WhatsappConfigException.notFound()
    }
    return row as WhatsappConfigRow
  }

  protected isUniqueViolation(error: unknown): boolean {
    if (!error || typeof error !== 'object') return false
    const code = (error as { code?: string }).code
    return code === '23505'
  }
}
