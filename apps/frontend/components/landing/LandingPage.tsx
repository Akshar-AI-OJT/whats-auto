import { CTASection } from '@/components/landing/sections/CTASection'
import { FeaturesSection } from '@/components/landing/sections/FeaturesSection'
import { HeroSection } from '@/components/landing/sections/HeroSection'
import { PricingSection } from '@/components/landing/sections/PricingSection'
import { TrustBarSection } from '@/components/landing/sections/TrustBarSection'
import { WhyChooseUsSection } from '@/components/landing/sections/WhyChooseUsSection'

export function LandingPage() {
  return (
    <main className="flex flex-1 flex-col">
      <HeroSection />
      <TrustBarSection />
      <FeaturesSection />
      <WhyChooseUsSection />
      <PricingSection />
      <CTASection />
    </main>
  )
}
