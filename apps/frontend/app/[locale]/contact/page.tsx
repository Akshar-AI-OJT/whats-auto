import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { ContactPage } from '@/components/contact/ContactPage'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('contactPage')

  return {
    title: t('metaTitle'),
    description: t('metaDescription'),
  }
}

export default function ContactRoutePage() {
  return <ContactPage />
}
