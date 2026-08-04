import env from '#start/env'
import type {
  MetaCreateMessageTemplateResult,
  MetaGraphErrorBody,
  MetaListMessageTemplatesResult,
  MetaPhoneNumberDetails,
  MetaSendMessageResult,
  MetaSendTemplateComponent,
  MetaTemplateComponent,
  MetaTokenExchangeResult,
} from '#lib/meta_whatsapp/types'

/**
 * Contract for Meta Graph WhatsApp operations.
 */
export interface MetaGraphClient {
  exchangeEmbeddedSignupCode(code: string): Promise<MetaTokenExchangeResult>
  subscribeAppToWaba(params: { wabaId: string; accessToken: string }): Promise<void>
  registerPhoneNumber(params: {
    phoneNumberId: string
    accessToken: string
    pin: string
  }): Promise<void>
  getPhoneNumber(params: {
    phoneNumberId: string
    accessToken: string
  }): Promise<MetaPhoneNumberDetails>
  /**
   * Low-level Cloud API text send (session/free-form within the customer care window).
   */
  sendTextMessage(params: {
    phoneNumberId: string
    accessToken: string
    to: string
    text: string
  }): Promise<MetaSendMessageResult>
  /**
   * Low-level Cloud API template send. Product sends resolve name/language/components
   * from `message_templates` and persist `messages.messageTemplateId`.
   * Optional `components` carry named header/body parameters; omit for parameterless
   * templates (e.g. `configs/:id/test` hello_world smoke send).
   */
  sendTemplateMessage(params: {
    phoneNumberId: string
    accessToken: string
    to: string
    templateName: string
    languageCode: string
    components?: MetaSendTemplateComponent[]
  }): Promise<MetaSendMessageResult>
  listMessageTemplates?(params: {
    wabaId: string
    accessToken: string
    limit?: number
    after?: string
  }): Promise<MetaListMessageTemplatesResult>
  createMessageTemplate?(params: {
    wabaId: string
    accessToken: string
    name: string
    category: string
    language: string
    components: MetaTemplateComponent[]
  }): Promise<MetaCreateMessageTemplateResult>
  deleteMessageTemplate?(params: {
    wabaId: string
    accessToken: string
    name: string
  }): Promise<{ success: boolean }>
}

export class MetaGraphApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: MetaGraphErrorBody | null,
    readonly operation: string
  ) {
    super(message)
    this.name = 'MetaGraphApiError'
  }
}

type FetchLike = typeof fetch

/**
 * HTTP implementation of Meta Graph API (Cloud API + OAuth code exchange).
 */
export class HttpMetaGraphClient implements MetaGraphClient {
  constructor(
    protected readonly options: {
      appId: string
      appSecret: string
      graphVersion: string
      fetchImpl?: FetchLike
    }
  ) {}

  protected get fetch(): FetchLike {
    return this.options.fetchImpl ?? globalThis.fetch.bind(globalThis)
  }

  protected get baseUrl(): string {
    return `https://graph.facebook.com/${this.options.graphVersion}`
  }

  async exchangeEmbeddedSignupCode(code: string): Promise<MetaTokenExchangeResult> {
    const url =
      `${this.baseUrl}/oauth/access_token?` +
      new URLSearchParams({
        client_id: this.options.appId,
        client_secret: this.options.appSecret,
        code,
      }).toString()

    const json = await this.requestJson<Record<string, unknown>>('exchangeCode', url, {
      method: 'GET',
    })

    const accessToken = json.access_token
    if (typeof accessToken !== 'string' || !accessToken) {
      throw new MetaGraphApiError(
        'Meta token exchange returned no access_token',
        502,
        json,
        'exchangeCode'
      )
    }

    return {
      accessToken,
      tokenType: typeof json.token_type === 'string' ? json.token_type : undefined,
      expiresIn: typeof json.expires_in === 'number' ? json.expires_in : undefined,
    }
  }

  async subscribeAppToWaba(params: { wabaId: string; accessToken: string }): Promise<void> {
    const url = `${this.baseUrl}/${encodeURIComponent(params.wabaId)}/subscribed_apps`
    await this.requestJson('subscribeApps', url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${params.accessToken}` },
    })
  }

  async registerPhoneNumber(params: {
    phoneNumberId: string
    accessToken: string
    pin: string
  }): Promise<void> {
    const url = `${this.baseUrl}/${encodeURIComponent(params.phoneNumberId)}/register`
    await this.requestJson('registerPhone', url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${params.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        pin: params.pin,
      }),
    })
  }

  async getPhoneNumber(params: {
    phoneNumberId: string
    accessToken: string
  }): Promise<MetaPhoneNumberDetails> {
    const url =
      `${this.baseUrl}/${encodeURIComponent(params.phoneNumberId)}` +
      `?fields=display_phone_number,verified_name,quality_rating`

    const json = await this.requestJson<Record<string, unknown>>('getPhone', url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${params.accessToken}` },
    })

    return {
      id: String(json.id ?? params.phoneNumberId),
      displayPhoneNumber:
        typeof json.display_phone_number === 'string' ? json.display_phone_number : undefined,
      verifiedName: typeof json.verified_name === 'string' ? json.verified_name : undefined,
      qualityRating: typeof json.quality_rating === 'string' ? json.quality_rating : undefined,
    }
  }

  /**
   * POST /{phone-number-id}/messages (type=text).
   */
  async sendTextMessage(params: {
    phoneNumberId: string
    accessToken: string
    to: string
    text: string
  }): Promise<MetaSendMessageResult> {
    const url = `${this.baseUrl}/${encodeURIComponent(params.phoneNumberId)}/messages`
    const json = await this.requestJson<Record<string, unknown>>('sendText', url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${params.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: params.to,
        type: 'text',
        text: {
          preview_url: false,
          body: params.text,
        },
      }),
    })

    return this.#parseSendResult(json)
  }

  /**
   * POST /{phone-number-id}/messages (type=template).
   * Optional `components` for named header/body parameters; omit for parameterless templates.
   */
  async sendTemplateMessage(params: {
    phoneNumberId: string
    accessToken: string
    to: string
    templateName: string
    languageCode: string
    components?: MetaSendTemplateComponent[]
  }): Promise<MetaSendMessageResult> {
    const url = `${this.baseUrl}/${encodeURIComponent(params.phoneNumberId)}/messages`
    const template: Record<string, unknown> = {
      name: params.templateName,
      language: { code: params.languageCode },
    }
    if (params.components && params.components.length > 0) {
      template.components = params.components
    }

    const json = await this.requestJson<Record<string, unknown>>('sendTemplate', url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${params.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: params.to,
        type: 'template',
        template,
      }),
    })

    return this.#parseSendResult(json)
  }

  #parseSendResult(json: Record<string, unknown>): MetaSendMessageResult {
    const messages = json.messages as Array<{ id?: string }> | undefined
    return {
      messageId: messages?.[0]?.id,
      raw: json,
    }
  }

  async listMessageTemplates(params: {
    wabaId: string
    accessToken: string
    limit?: number
    after?: string
  }): Promise<MetaListMessageTemplatesResult> {
    const search = new URLSearchParams()
    if (params.limit) search.set('limit', String(params.limit))
    if (params.after) search.set('after', params.after)

    const query = search.toString() ? `?${search.toString()}` : ''
    const url = `${this.baseUrl}/${encodeURIComponent(params.wabaId)}/message_templates${query}`

    return this.requestJson<MetaListMessageTemplatesResult>('listTemplates', url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${params.accessToken}` },
    })
  }

  async createMessageTemplate(params: {
    wabaId: string
    accessToken: string
    name: string
    category: string
    language: string
    components: MetaTemplateComponent[]
  }): Promise<MetaCreateMessageTemplateResult> {
    const url = `${this.baseUrl}/${encodeURIComponent(params.wabaId)}/message_templates`

    return this.requestJson<MetaCreateMessageTemplateResult>('createTemplate', url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${params.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: params.name,
        category: params.category,
        language: params.language,
        components: params.components,
      }),
    })
  }

  async deleteMessageTemplate(params: {
    wabaId: string
    accessToken: string
    name: string
  }): Promise<{ success: boolean }> {
    const url = `${this.baseUrl}/${encodeURIComponent(params.wabaId)}/message_templates?name=${encodeURIComponent(params.name)}`

    const json = await this.requestJson<Record<string, unknown>>('deleteTemplate', url, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${params.accessToken}` },
    })

    return { success: json.success === true }
  }

  protected async requestJson<T = Record<string, unknown>>(
    operation: string,
    url: string,
    init: RequestInit
  ): Promise<T> {
    const response = await this.fetch(url, init)
    let body: MetaGraphErrorBody & Record<string, unknown>
    try {
      body = (await response.json()) as MetaGraphErrorBody & Record<string, unknown>
    } catch {
      throw new MetaGraphApiError(
        `Meta Graph ${operation} returned non-JSON (HTTP ${response.status})`,
        response.status,
        null,
        operation
      )
    }

    if (!response.ok) {
      const message =
        body.error?.message ?? `Meta Graph ${operation} failed (HTTP ${response.status})`
      throw new MetaGraphApiError(message, response.status, body, operation)
    }

    return body as T
  }
}

/**
 * Default client wired from platform env. Services should prefer this factory
 * (or an injected client) over constructing HttpMetaGraphClient ad hoc.
 */
export function createMetaGraphClient(fetchImpl?: FetchLike): MetaGraphClient {
  return new HttpMetaGraphClient({
    appId: env.get('META_APP_ID'),
    appSecret: env.get('META_APP_SECRET').release(),
    graphVersion: env.get('META_GRAPH_API_VERSION'),
    fetchImpl,
  })
}
