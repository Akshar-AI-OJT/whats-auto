import env from '#start/env'
import type {
  CreateRazorpayCustomerParams,
  CreateRazorpayOrderParams,
  RazorpayClient,
  RazorpayCustomer,
  RazorpayOrder,
} from '#lib/razorpay/types'

export class RazorpayApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: unknown,
    readonly operation: string
  ) {
    super(message)
    this.name = 'RazorpayApiError'
  }
}

type FetchLike = typeof fetch

/**
 * HTTP Razorpay REST client (Basic auth). No SDK dependency.
 */
export class HttpRazorpayClient implements RazorpayClient {
  constructor(
    protected readonly options: {
      keyId: string
      keySecret: string
      fetchImpl?: FetchLike
      baseUrl?: string
    }
  ) {}

  protected get fetch(): FetchLike {
    return this.options.fetchImpl ?? globalThis.fetch.bind(globalThis)
  }

  protected get baseUrl(): string {
    return this.options.baseUrl ?? 'https://api.razorpay.com/v1'
  }

  protected authHeader(): string {
    const token = Buffer.from(`${this.options.keyId}:${this.options.keySecret}`).toString('base64')
    return `Basic ${token}`
  }

  protected async requestJson<T>(operation: string, path: string, init: RequestInit): Promise<T> {
    const response = await this.fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        'Authorization': this.authHeader(),
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...(init.headers ?? {}),
      },
    })

    const text = await response.text()
    let body: unknown = null
    if (text) {
      try {
        body = JSON.parse(text)
      } catch {
        body = { raw: text }
      }
    }

    if (!response.ok) {
      const message =
        typeof body === 'object' &&
        body !== null &&
        'error' in body &&
        typeof (body as { error?: { description?: string } }).error?.description === 'string'
          ? (body as { error: { description: string } }).error.description
          : `Razorpay ${operation} failed (${response.status})`

      throw new RazorpayApiError(message, response.status, body, operation)
    }

    return body as T
  }

  async createCustomer(params: CreateRazorpayCustomerParams): Promise<RazorpayCustomer> {
    return this.requestJson<RazorpayCustomer>('createCustomer', '/customers', {
      method: 'POST',
      body: JSON.stringify({
        name: params.name,
        email: params.email,
        contact: params.contact ?? undefined,
        fail_existing: params.failExisting ?? '0',
        notes: params.notes,
      }),
    })
  }

  async createOrder(params: CreateRazorpayOrderParams): Promise<RazorpayOrder> {
    return this.requestJson<RazorpayOrder>('createOrder', '/orders', {
      method: 'POST',
      body: JSON.stringify({
        amount: params.amount,
        currency: params.currency,
        receipt: params.receipt,
        notes: params.notes,
      }),
    })
  }

  async fetchOrder(orderId: string): Promise<RazorpayOrder> {
    return this.requestJson<RazorpayOrder>('fetchOrder', `/orders/${encodeURIComponent(orderId)}`, {
      method: 'GET',
    })
  }
}

export function createRazorpayClient(fetchImpl?: FetchLike): RazorpayClient {
  return new HttpRazorpayClient({
    keyId: env.get('RAZORPAY_KEY_ID'),
    keySecret: env.get('RAZORPAY_KEY_SECRET').release(),
    fetchImpl,
  })
}
