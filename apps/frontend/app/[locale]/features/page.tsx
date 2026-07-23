import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { FeaturesPage } from '@/components/features/page/FeaturesPage'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('featuresPage')

  return {
    title: t('metaTitle'),
    description: t('metaDescription'),
  }
}

export default function FeaturesIndexPage() {
  return <FeaturesPage />
}
