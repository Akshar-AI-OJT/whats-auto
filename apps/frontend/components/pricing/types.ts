export const pricingTierIds = ['starter', 'growth', 'enterprise'] as const

export type PricingTierId = (typeof pricingTierIds)[number]

export interface PricingTierData {
  id: PricingTierId
  name: string
  price: string
  period: string
  description: string
  cta: string
  highlighted?: boolean
}
