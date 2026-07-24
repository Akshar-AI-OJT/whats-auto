import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { PrivacyPage } from '@/components/privacy/PrivacyPage'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('privacyPage')

  return {
    title: t('metaTitle'),
    description: t('metaDescription'),
  }
}

export default function PrivacyRoutePage() {
  return <PrivacyPage />
}
