import { getTranslations } from 'next-intl/server'
import { features } from '@/components/features/registry'
import { integrations } from '@/components/integrations/registry'
import { NavbarClient } from '@/components/layout/NavbarClient'
import type { NavData } from '@/components/layout/types'

export async function Navbar() {
  const t = await getTranslations('nav')
  const tFeatures = await getTranslations('features')
  const tIntegrations = await getTranslations('integrations')

  const nav: NavData = {
    brand: t('brand'),
    pricing: { label: t('pricing'), href: '/pricing' },
    features: {
      id: 'features',
      label: t('features'),
      href: '/features',
      items: features.map((feature) => ({
        label: tFeatures(`${feature.slug}.title`),
        href: `/features/${feature.slug}`,
      })),
    },
    integrations: {
      id: 'integrations',
      label: t('integrations'),
      items: integrations.map((integration) => ({
        label: tIntegrations(`${integration.slug}.name`),
        href: `/integrations/${integration.slug}`,
      })),
    },
    login: { label: t('login'), href: '/login' },
    getStarted: { label: t('getStarted'), href: '/register' },
  }

  return <NavbarClient nav={nav} />
}
