export type RazorpayNotes = Record<string, string>

export type RazorpayCustomer = {
  id: string
  name?: string | null
  email?: string | null
  contact?: string | null
  notes?: RazorpayNotes
}

export type RazorpaySubscription = {
  id: string
  plan_id: string
  customer_id?: string | null
  status: string
  short_url?: string | null
  current_start?: number | null
  current_end?: number | null
  notes?: RazorpayNotes
}

export type CreateRazorpayCustomerParams = {
  name: string
  email: string
  contact?: string | null
  notes?: RazorpayNotes
  /** When "0", return existing customer on duplicate email/contact instead of failing. */
  failExisting?: '0' | '1'
}

export type CreateRazorpaySubscriptionParams = {
  planId: string
  customerId: string
  totalCount: number
  quantity?: number
  customerNotify?: boolean
  notes: RazorpayNotes
}

/**
 * Contract for platform Razorpay REST calls (SaaS billing).
 */
export interface RazorpayClient {
  createCustomer(params: CreateRazorpayCustomerParams): Promise<RazorpayCustomer>
  createSubscription(params: CreateRazorpaySubscriptionParams): Promise<RazorpaySubscription>
}
