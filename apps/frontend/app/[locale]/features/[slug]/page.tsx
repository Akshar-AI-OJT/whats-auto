import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { Suspense } from 'react'
import { FeatureDetail } from '@/components/features/FeatureDetail'
import {
  getFeatureBySlug,
  getFeatureSlugs,
} from '@/components/features/registry'

type PageProps = {
  params: Promise<{ locale: string; slug: string }>
}

export function generateStaticParams() {
  return getFeatureSlugs().map((slug) => ({ slug }))
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { locale, slug } = await params
  const feature = getFeatureBySlug(slug)

  if (!feature) {
    return {}
  }

  const t = await getTranslations({ locale, namespace: 'features' })

  return {
    title: t(`${slug}.title`),
    description: t(`${slug}.summary`),
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

export default async function FeaturePage({ params }: PageProps) {
  const { slug } = await params
  const feature = getFeatureBySlug(slug)

  if (!feature) {
    notFound()
  }

  const Content = (await feature.content()).default
  const t = await getTranslations('features')
  const tDetail = await getTranslations('featureDetail')

  return (
    <FeatureDetail
      icon={feature.icon}
      title={t(`${slug}.title`)}
      summary={t(`${slug}.summary`)}
      ctaLabel={tDetail('cta')}
    >
      <Suspense fallback={<ContentFallback />}>
        <Content />
      </Suspense>
    </FeatureDetail>
  )
}
