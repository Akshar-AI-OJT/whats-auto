import { Mail } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { FeaturesAurora } from '@/components/features/page/FeaturesAurora'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { BookDemoScrollButton } from './BookDemoScrollButton'

export async function BookDemoCTA() {
  const t = await getTranslations('bookDemoPage.cta')

  return (
    <section
      id="book-demo-cta"
      className="relative scroll-mt-24 overflow-x-clip py-16 sm:py-20 md:py-24"
    >
      <FeaturesAurora />
      <div className="relative z-10 mx-auto max-w-[1200px] px-4 sm:px-6">
        <div
          className={cn(
            'mx-auto flex max-w-3xl flex-col items-center rounded-[32px] border border-[#E2E8F0] bg-canvas/85 px-6 py-12 text-center sm:px-10 sm:py-14',
            'shadow-[0_1px_2px_rgb(15_23_42/0.04),0_24px_60px_rgb(15_23_42/0.08)]',
            'backdrop-blur-sm'
          )}
        >
          <p className="mb-5 inline-flex items-center rounded-full border border-[#E2E8F0] bg-canvas px-3 py-1 text-xs font-semibold text-positive-deep shadow-[0_1px_2px_rgb(15_23_42/0.04)] sm:text-sm">
            {t('badge')}
          </p>

          <h2 className="font-display max-w-[20ch] text-3xl leading-tight tracking-tight text-ink sm:text-4xl md:text-[2.75rem]">
            {t('title')}
          </h2>

          <p className="mt-4 max-w-xl text-base leading-7 text-body sm:text-lg sm:leading-8">
            {t('description')}
          </p>

          <div className="mt-8 flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center sm:justify-center">
            <BookDemoScrollButton label={t('primary')} />

            <button
              type="button"
              disabled
              aria-disabled="true"
              tabIndex={-1}
              title={t('secondaryTooltip')}
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
              <span>{t('secondary')}</span>
              <span className="rounded-full border border-[#E2E8F0] bg-[#F8FAFC] px-2 py-0.5 text-[10px] font-semibold tracking-wide text-mute uppercase">
                {t('secondaryBadge')}
              </span>
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}
