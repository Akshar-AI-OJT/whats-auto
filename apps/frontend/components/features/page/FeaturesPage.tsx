import { FeaturesFinalCta } from './FeaturesFinalCta'
import { FeaturesHero } from './FeaturesHero'
import { FeaturesSecurity } from './FeaturesSecurity'
import { FeaturesSpotlights } from './FeaturesSpotlights'
import { FeaturesWorkflow } from './FeaturesWorkflow'

export function FeaturesPage() {
  return (
    <main className="w-full flex-1 overflow-x-clip">
      <FeaturesHero />
      <FeaturesSpotlights />
      <FeaturesWorkflow />
      <FeaturesSecurity />
      <FeaturesFinalCta />
    </main>
  )
}
