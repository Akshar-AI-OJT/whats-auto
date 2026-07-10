import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { Suspense } from 'react'
import { IntegrationDetail } from '@/components/integrations/IntegrationDetail'
import {
  getIntegrationBySlug,
  getIntegrationSlugs,
} from '@/components/integrations/registry'

type PageProps = {
  params: Promise<{ locale: string; slug: string }>
}

export function generateStaticParams() {
  return getIntegrationSlugs().map((slug) => ({ slug }))
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { locale, slug } = await params
  const integration = getIntegrationBySlug(slug)

  if (!integration) {
    return {}
  }

  const t = await getTranslations({ locale, namespace: 'integrations' })

  return {
    title: t(`${slug}.name`),
    description: t(`${slug}.tagline`),
  }
}

function ContentFallback() {
  return (
    <div className="flex flex-col gap-4">
      <div className="h-4 w-full animate-pulse rounded bg-muted" />
      <div className="h-4 w-5/6 animate-pulse rounded bg-muted" />
      <div className="h-4 w-4/6 animate-pulse rounded bg-muted" />
    </div>
  )
}

export default async function IntegrationPage({ params }: PageProps) {
  const { slug } = await params
  const integration = getIntegrationBySlug(slug)

  if (!integration) {
    notFound()
  }

  const Content = (await integration.content()).default
  const t = await getTranslations('integrations')
  const tDetail = await getTranslations('integrationDetail')

  return (
    <IntegrationDetail
      name={t(`${slug}.name`)}
      logo={integration.logo}
      tagline={t(`${slug}.tagline`)}
      ctaLabel={tDetail('cta')}
    >
      <Suspense fallback={<ContentFallback />}>
        <Content />
      </Suspense>
    </IntegrationDetail>
  )
}
