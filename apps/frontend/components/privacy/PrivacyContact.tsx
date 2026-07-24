import { Mail } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { FeaturesReveal } from '@/components/features/page/FeaturesReveal'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export async function PrivacyContact() {
  const t = await getTranslations('privacyPage.contact')

  return (
    <div id="privacy-contact" className="scroll-mt-28 mt-8 sm:mt-10 md:mt-12">
      <FeaturesReveal>
        <div
          className={cn(
            'flex flex-col items-center rounded-[32px] border border-[#E2E8F0] bg-canvas/85 px-6 py-10 text-center sm:px-10 sm:py-12',
            'shadow-[0_1px_2px_rgb(15_23_42/0.04),0_24px_60px_rgb(15_23_42/0.08)]',
            'backdrop-blur-sm'
          )}
        >
          <h2 className="font-display max-w-[18ch] text-3xl leading-tight tracking-tight text-ink sm:text-4xl">
            {t('title')}
          </h2>
          <p className="mt-4 max-w-xl text-base leading-7 text-body sm:text-lg sm:leading-8">
            {t('description')}
          </p>

          <p className="mt-6 inline-flex items-center gap-2 text-base font-semibold text-ink sm:text-lg">
            <span aria-hidden>📧</span>
            <span>{t('email')}</span>
          </p>

          <div className="mt-8 flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center sm:justify-center">
            <button
              type="button"
              disabled
              aria-disabled="true"
              tabIndex={-1}
              title={t('buttonTooltip')}
              className={cn(
                buttonVariants({ variant: 'outline', size: 'lg' }),
                'justify-center gap-2 rounded-xl border-[#E2E8F0] bg-canvas',
                'cursor-not-allowed opacity-90',
                'disabled:pointer-events-auto disabled:cursor-not-allowed disabled:opacity-90',
                'hover:translate-y-0 hover:border-[#E2E8F0] hover:bg-canvas hover:shadow-none',
                'active:scale-100'
              )}
            >
              <Mail className="size-4 text-mute" aria-hidden />
              <span>{t('button')}</span>
              <span className="rounded-full border border-[#E2E8F0] bg-[#F8FAFC] px-2 py-0.5 text-[10px] font-semibold tracking-wide text-mute uppercase">
                {t('buttonBadge')}
              </span>
            </button>
          </div>
        </div>
      </FeaturesReveal>
    </div>
  )
}
