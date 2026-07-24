import { PricingComparison } from './PricingComparison'
import { PricingFaq } from './PricingFaq'
import { PricingFinalCta } from './PricingFinalCta'
import { PricingHero } from './PricingHero'
import { PricingPlans } from './PricingPlans'

export function PricingPageView() {
  return (
    <main className="w-full flex-1 overflow-x-clip">
      <PricingHero />
      <PricingPlans />
      <PricingComparison />
      <PricingFaq />
      <PricingFinalCta />
    </main>
  )
}
