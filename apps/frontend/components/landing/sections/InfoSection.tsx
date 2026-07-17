import { getTranslations } from 'next-intl/server'
import { InfoSectionClient, InfoPoint } from '@/components/landing/sections/InfoSectionClient'

const pointKeys = ['automation', 'replies', 'integrations', 'workflows', 'everywhere'] as const

export async function InfoSection() {
  const t = await getTranslations('landing.info')

  const points: InfoPoint[] = pointKeys.map((key, i) => ({
    index: String(i + 1).padStart(2, '0'),
    key,
    eyebrow: t(`points.${key}.eyebrow`),
    title: t(`points.${key}.title`),
    description: t(`points.${key}.description`),
    bullets: [t(`points.${key}.bullet1`), t(`points.${key}.bullet2`), t(`points.${key}.bullet3`)],
  }))

  return <InfoSectionClient title={t('title')} points={points} />
}
