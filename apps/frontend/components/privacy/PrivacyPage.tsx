import { getTranslations } from 'next-intl/server'
import { LegalBodyLayout } from '@/components/legal/LegalBodyLayout'
import { LegalQuickNav } from '@/components/legal/LegalQuickNav'
import { PrivacyContact } from './PrivacyContact'
import { PrivacyHero } from './PrivacyHero'
import { PrivacySections } from './PrivacySections'

export async function PrivacyPage() {
  const t = await getTranslations('privacyPage.nav')

  const items = [
    { id: 'collect', label: t('collect') },
    { id: 'use', label: t('use') },
    { id: 'protection', label: t('protection') },
    { id: 'cookies', label: t('cookies') },
    { id: 'thirdParty', label: t('thirdParty') },
    { id: 'rights', label: t('rights') },
    { id: 'updates', label: t('updates') },
    { id: 'privacy-contact', label: t('contact') },
  ]

  return (
    <main className="w-full flex-1 overflow-x-clip">
      <PrivacyHero />
      <LegalBodyLayout
        nav={
          <LegalQuickNav
            items={items}
            title={t('title')}
            mobileTitle={t('mobileTitle')}
          />
        }
      >
        <PrivacySections />
        <PrivacyContact />
      </LegalBodyLayout>
    </main>
  )
}
