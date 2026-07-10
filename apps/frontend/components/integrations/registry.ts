import type { Integration } from './types'

// To add a new integration: append an object here.
// Do not touch IntegrationCard, IntegrationDetail, or any page.

export const integrations: Integration[] = [
  {
    slug: 'shopify',
    name: 'Shopify',
    logo: '/logos/shopify.svg',
    tagline: 'Sync your store in minutes.',
    content: () => import('./content/ShopifyContent'),
  },
  {
    slug: 'razorpay',
    name: 'Razorpay',
    logo: '/logos/razorpay.svg',
    tagline: 'Automate payment confirmations.',
    content: () => import('./content/RazorpayContent'),
  },
]

export function getIntegrationBySlug(slug: string): Integration | undefined {
  return integrations.find((integration) => integration.slug === slug)
}

export function getIntegrationSlugs(): string[] {
  return integrations.map((integration) => integration.slug)
}
