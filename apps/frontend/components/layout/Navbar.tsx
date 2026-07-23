import { getTranslations } from 'next-intl/server'
import { NavbarClient } from '@/components/layout/NavbarClient'
import type { NavData } from '@/components/layout/types'

export async function Navbar() {
  const t = await getTranslations('nav')

  const nav: NavData = {
    brand: t('brand'),
    links: [
      {
        label: t('features'),
        href: '/features',
        sectionId: 'features',
        isPageLink: true,
      },
      { label: t('pricing'), href: '#pricing', sectionId: 'pricing' },
      { label: t('contact'), href: '#contact', sectionId: 'contact' },
      // Hidden until sections exist: #how-it-works, #faq
    ],
    login: { label: t('login'), href: '/login' },
    getStarted: { label: t('getStarted'), href: '/register' },
  }

  return <NavbarClient nav={nav} />
}
