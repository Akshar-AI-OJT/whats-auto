import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { TermsPage } from '@/components/terms/TermsPage'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('termsPage')

  return {
    title: t('metaTitle'),
    description: t('metaDescription'),
  }
}

export default function TermsRoutePage() {
  return <TermsPage />
}
