import { getTranslations } from 'next-intl/server'
import { LegalBodyLayout } from '@/components/legal/LegalBodyLayout'
import { LegalQuickNav } from '@/components/legal/LegalQuickNav'
import { TermsContact } from './TermsContact'
import { TermsHero } from './TermsHero'
import { TermsSections } from './TermsSections'
import { TermsUpdated } from './TermsUpdated'

export async function TermsPage() {
  const t = await getTranslations('termsPage.nav')

  const items = [
    { id: 'acceptance', label: t('acceptance') },
    { id: 'accounts', label: t('accounts') },
    { id: 'acceptableUse', label: t('acceptableUse') },
    { id: 'intellectualProperty', label: t('intellectualProperty') },
    { id: 'availability', label: t('availability') },
    { id: 'liability', label: t('liability') },
    { id: 'updates', label: t('updates') },
    { id: 'governingLaw', label: t('governingLaw') },
    { id: 'terms-contact', label: t('contact') },
  ]

  return (
    <main className="w-full flex-1">
      <TermsHero />
      <TermsUpdated />
      <LegalBodyLayout
        nav={
          <LegalQuickNav
            items={items}
            title={t('title')}
            mobileTitle={t('mobileTitle')}
          />
        }
      >
        <TermsSections />
        <TermsContact />
      </LegalBodyLayout>
    </main>
  )
}
