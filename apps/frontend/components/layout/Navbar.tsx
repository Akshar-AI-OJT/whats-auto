import { getTranslations } from 'next-intl/server'
import { features } from '@/components/features/registry'
import { integrations } from '@/components/integrations/registry'
import { NavbarClient } from '@/components/layout/NavbarClient'
import type { NavData } from '@/components/layout/types'

export async function Navbar() {
  const t = await getTranslations('nav')

  const nav: NavData = {
    brand: t('brand'),
    pricing: { label: t('pricing'), href: '/pricing' },
    features: {
      id: 'features',
      label: t('features'),
      items: features.map((feature) => ({
        label: feature.title,
        href: `/features/${feature.slug}`,
      })),
    },
    integrations: {
      id: 'integrations',
      label: t('integrations'),
      items: integrations.map((integration) => ({
        label: integration.name,
        href: `/integrations/${integration.slug}`,
      })),
    },
    login: { label: t('login'), href: '/login' },
    getStarted: { label: t('getStarted'), href: '/register' },
  }

  return <NavbarClient nav={nav} />
}
