export type RazorpayNotes = Record<string, string>

export type RazorpayCustomer = {
  id: string
  name?: string | null
  email?: string | null
  contact?: string | null
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

export type CreateRazorpayOrderParams = {
  amount: number
  currency: string
  receipt?: string
  notes?: RazorpayNotes
}

export type RazorpayOrder = {
  id: string
  amount: number
  currency: string
  status: string
  receipt?: string | null
  notes?: RazorpayNotes
  created_at?: number
}

/**
 * Contract for platform Razorpay REST calls (SaaS billing).
 */
export interface RazorpayClient {
  createCustomer(params: CreateRazorpayCustomerParams): Promise<RazorpayCustomer>
  createOrder(params: CreateRazorpayOrderParams): Promise<RazorpayOrder>
  fetchOrder(orderId: string): Promise<RazorpayOrder>
}
