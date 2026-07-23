import { CTASection } from '@/components/landing/sections/CTASection'
import { FeaturePreviewSection } from '@/components/landing/sections/FeaturePreviewSection'
import { HeroSection } from '@/components/landing/sections/HeroSection'
import { PricingPreviewSection } from '@/components/landing/sections/PricingPreviewSection'
import { WhyWhatsAutoSection } from '@/components/landing/sections/WhyWhatsAutoSection'

export function LandingPage() {
  return (
    <main className="w-full flex-1">
      <HeroSection />
      <WhyWhatsAutoSection />
      <FeaturePreviewSection />
      {/* How It Works */}
      <PricingPreviewSection />
      {/* FAQ */}
      <CTASection />
    </main>
  )
}
