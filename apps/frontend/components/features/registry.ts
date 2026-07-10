import type { Feature } from './types'

// To add a new feature: append an object here.
// Do not touch FeatureCard, FeatureDetail, FeaturesSection, or any page.

export const features: Feature[] = [
  {
    slug: 'whatsapp-automation',
    title: 'WhatsApp Automation',
    icon: 'MessageCircle',
    summary: 'Send and receive messages automatically.',
    content: () => import('./content/WhatsAppContent'),
  },
  {
    slug: 'smart-replies',
    title: 'Smart Replies',
    icon: 'Zap',
    summary: 'AI-powered reply suggestions.',
    content: () => import('./content/SmartRepliesContent'),
  },
]

export function getFeatureBySlug(slug: string): Feature | undefined {
  return features.find((feature) => feature.slug === slug)
}

export function getFeatureSlugs(): string[] {
  return features.map((feature) => feature.slug)
}
