import type { LandingSection } from './types'
import { CTASection } from './sections/CTASection'
import { FeaturesSection } from './sections/FeaturesSection'
import { HeroSection } from './sections/HeroSection'
import { PricingSection } from './sections/PricingSection'

// To add a new landing section: append here.
export const landingSections: LandingSection[] = [
  { id: 'hero', component: HeroSection, order: 0 },
  { id: 'features', component: FeaturesSection, order: 1 },
  { id: 'pricing', component: PricingSection, order: 2 },
  { id: 'cta', component: CTASection, order: 3 },
]

export function getSortedLandingSections(): LandingSection[] {
  return [...landingSections].sort((a, b) => a.order - b.order)
}
