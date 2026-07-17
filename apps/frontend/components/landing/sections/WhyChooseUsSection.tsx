import { getTranslations } from 'next-intl/server'
import {
  WhyChooseUsClient,
  type WhyPoint,
} from '@/components/landing/sections/WhyChooseUsClient'

const pointKeys = ['speed', 'conversion', 'stack', 'scale'] as const

export async function WhyChooseUsSection() {
  const t = await getTranslations('landing.whyChooseUs')

  const points: WhyPoint[] = pointKeys.map((key, i) => ({
    index: String(i + 1).padStart(2, '0'),
    key,
    eyebrow: t(`points.${key}.eyebrow`),
    title: t(`points.${key}.title`),
    description: t(`points.${key}.description`),
    bullets: [
      t(`points.${key}.bullet1`),
      t(`points.${key}.bullet2`),
      t(`points.${key}.bullet3`),
    ],
  }))

  return <WhyChooseUsClient title={t('title')} points={points} />
}
