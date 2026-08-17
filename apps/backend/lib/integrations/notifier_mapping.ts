import type {
  IntegrationEventSubject,
  IntegrationEventType,
} from '#lib/integrations/event_contract'

export const COMMERCE_TEMPLATE_BY_TYPE: Record<
  Exclude<IntegrationEventType, 'crm.contact_upserted'>,
  string
> = {
  'commerce.order_placed': 'shopenup_cod_to_prepaid',
  'commerce.order_paid': 'shopenup_order_confirmed',
  'commerce.order_shipped': 'shopenup_order_shipped',
  'commerce.order_delivered': 'shopenup_order_delivered_review',
  'commerce.product_created': 'shopenup_new_arrival',
}

export const INTEGRATION_NOTIFY_ERROR = {
  MISSING_PHONE: 'MISSING_PHONE',
  TEMPLATE_NOT_READY: 'TEMPLATE_NOT_READY',
  CONFIG_NOT_CONNECTED: 'CONFIG_NOT_CONNECTED',
  INVALID_PHONE: 'INVALID_PHONE',
  TEMPLATE_PARAMS: 'TEMPLATE_PARAMS',
} as const

export type IntegrationNotifyError =
  (typeof INTEGRATION_NOTIFY_ERROR)[keyof typeof INTEGRATION_NOTIFY_ERROR]

function asString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed || undefined
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    const parsed = asString(value)
    if (parsed) return parsed
  }
  return undefined
}

/**
 * Collect named template values from the event subject/payload.
 * Does not invent copy — only maps fields that were already present.
 */
export function collectNotifierValues(params: {
  subject: IntegrationEventSubject
  payload: Record<string, unknown>
}): { parameters: Record<string, string>; headerMediaUrl?: string } {
  const { subject, payload } = params
  const parameters: Record<string, string> = {}

  for (const [key, value] of Object.entries(payload)) {
    const parsed = asString(value)
    if (parsed) parameters[key] = parsed
  }

  const customer = payload.customer
  const customerRecord =
    customer && typeof customer === 'object' && !Array.isArray(customer)
      ? (customer as Record<string, unknown>)
      : null

  const customerName = firstString(
    parameters.customer_name,
    payload.customerName,
    payload.name,
    customerRecord?.name
  )
  if (customerName) parameters.customer_name = customerName

  const orderId = firstString(
    parameters.order_id,
    subject.externalOrderId,
    payload.orderId,
    payload.displayId
  )
  if (orderId) parameters.order_id = orderId

  const ctaUrl = firstString(
    parameters.cta_url,
    payload.ctaUrl,
    payload.productHandle,
    payload.handle
  )
  if (ctaUrl) parameters.cta_url = ctaUrl

  const sku = firstString(parameters.sku, payload.sku, payload.productHandle)
  if (sku) parameters.sku = sku

  const headerMediaUrl = firstString(
    payload.headerMediaUrl,
    payload.imageUrl,
    payload.thumbnailUrl,
    payload.thumbnail
  )

  return headerMediaUrl ? { parameters, headerMediaUrl } : { parameters }
}

export function pickRequiredTemplateValues(params: {
  required: string[]
  candidates: Record<string, string>
}): { ok: true; values: Record<string, string> } | { ok: false; missing: string } {
  const values: Record<string, string> = {}
  for (const name of params.required) {
    const value = params.candidates[name]
    if (!value) {
      return { ok: false, missing: name }
    }
    values[name] = value
  }
  return { ok: true, values }
}
