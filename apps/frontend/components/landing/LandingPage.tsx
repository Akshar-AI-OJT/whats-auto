import { CTASection } from '@/components/landing/sections/CTASection'
import { FeaturesSection } from '@/components/landing/sections/FeaturesSection'
import { HeroSection } from '@/components/landing/sections/HeroSection'
import { PricingSection } from '@/components/landing/sections/PricingSection'
import { InfoSection } from '@/components/landing/sections/InfoSection'

export function LandingPage() {
  return (
    <main className="flex flex-1 flex-col">
      <HeroSection />
      <FeaturesSection />
      <InfoSection />
      <PricingSection />
      <CTASection />
    </main>
  )
}
