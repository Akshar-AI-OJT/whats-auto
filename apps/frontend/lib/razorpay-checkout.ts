const SCRIPT_ID = 'razorpay-checkout-js'
const SCRIPT_SRC = 'https://checkout.razorpay.com/v1/checkout.js'

export type RazorpayCheckoutSuccess = {
  razorpay_payment_id: string
  razorpay_order_id: string
  razorpay_signature: string
}

type RazorpayCheckoutOptions = {
  key: string
  amount: number
  currency: string
  name: string
  description?: string
  order_id: string
  prefill?: { name?: string; email?: string; contact?: string | null }
  theme?: { color?: string }
  handler: (response: RazorpayCheckoutSuccess) => void
  modal?: { ondismiss?: () => void }
}

type RazorpayInstance = {
  open: () => void
  on: (event: string, handler: (response: unknown) => void) => void
}

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayCheckoutOptions) => RazorpayInstance
  }
}

export async function loadRazorpayCheckout(): Promise<void> {
  if (typeof window === 'undefined') {
    throw new Error('Razorpay checkout is only available in the browser')
  }
  if (window.Razorpay) return

  const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null
  if (existing) {
    await new Promise<void>((resolve, reject) => {
      existing.addEventListener('load', () => resolve(), { once: true })
      existing.addEventListener('error', () => reject(new Error('Failed to load Razorpay')), {
        once: true,
      })
    })
    return
  }

  await new Promise<void>((resolve, reject) => {
    const script = document.createElement('script')
    script.id = SCRIPT_ID
    script.src = SCRIPT_SRC
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Failed to load Razorpay'))
    document.body.appendChild(script)
  })
}

export async function openRazorpayCheckout(options: {
  key: string
  amount: number
  currency: string
  name: string
  description?: string
  orderId: string
  prefill?: { name?: string; email?: string; contact?: string | null }
}): Promise<RazorpayCheckoutSuccess> {
  await loadRazorpayCheckout()
  const RazorpayCtor = window.Razorpay
  if (!RazorpayCtor) {
    throw new Error('Razorpay checkout is unavailable')
  }

  return new Promise((resolve, reject) => {
    const checkout = new RazorpayCtor({
      key: options.key,
      amount: options.amount,
      currency: options.currency,
      name: options.name,
      description: options.description,
      order_id: options.orderId,
      prefill: options.prefill,
      theme: { color: '#0f766e' },
      handler: (response) => resolve(response),
      modal: {
        ondismiss: () => reject(new Error('Payment cancelled')),
      },
    })
    checkout.open()
  })
}
