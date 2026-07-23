'use client'

import { useTranslations } from 'next-intl'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { FeaturesReveal } from '@/components/features/page/FeaturesReveal'

const FAQ_KEYS = [
  'upgrade',
  'cancel',
  'trial',
  'enterprise',
  'support',
] as const

export function PricingFaq() {
  const t = useTranslations('pricingPage.faq')

  return (
    <section className="bg-canvas py-16 sm:py-20 md:py-24">
      <div className="mx-auto max-w-[800px] px-4 sm:px-6">
        <FeaturesReveal className="mb-10 text-center md:mb-12">
          <h2 className="font-display text-3xl leading-tight tracking-tight text-ink sm:text-4xl md:text-[2.75rem]">
            {t('title')}
          </h2>
          <p className="mt-4 text-base leading-7 text-body sm:text-lg">
            {t('subtitle')}
          </p>
        </FeaturesReveal>

        <FeaturesReveal delayMs={80}>
          <div className="rounded-[28px] border border-[#E2E8F0] bg-canvas px-5 shadow-[0_1px_2px_rgb(15_23_42/0.04),0_16px_40px_rgb(15_23_42/0.06)] sm:px-6">
            <Accordion>
              {FAQ_KEYS.map((key) => (
                <AccordionItem key={key} value={key} className="border-[#E2E8F0]">
                  <AccordionTrigger className="py-5 text-base font-semibold text-ink hover:no-underline">
                    {t(`items.${key}.question`)}
                  </AccordionTrigger>
                  <AccordionContent className="pb-5 text-[15px] leading-7 text-body">
                    {t(`items.${key}.answer`)}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </FeaturesReveal>
      </div>
    </section>
  )
}
