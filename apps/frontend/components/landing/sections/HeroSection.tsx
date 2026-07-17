import { getTranslations } from 'next-intl/server'
import { Link } from '@/i18n/navigation'
import { buttonVariants } from '@/components/ui/button'
import { RotatingHeadline } from './RotatingHeadline'

export async function HeroSection() {
  const t = await getTranslations('hero')

  return (
    <section className="bg-canvas-soft">
      <div className="mx-auto flex max-w-[1200px] flex-col items-center px-4 pb-12 pt-10 text-center sm:pt-14 md:px-6 md:pt-16 md:pb-16">
        <p className="mb-4 inline-flex items-center rounded-full bg-primary-pale px-3 py-1 text-sm font-semibold text-positive-deep">
          {t('eyebrow')}
        </p>

        <div className="w-full max-w-4xl">
          <RotatingHeadline
            prefix={t('headlinePrefix')}
            words1={t.raw('words1')}
            words2={t.raw('words2')}
            suffix={t('headlineSuffix')}
          />
        </div>

        <p className="mt-5 max-w-xl text-base text-body md:text-lg md:leading-7">
          {t('subheadline')}
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link href="/register" className={buttonVariants({ size: 'lg' })}>
            {t('cta')}
          </Link>
          <Link
            href="/features"
            className={buttonVariants({ variant: 'outline', size: 'lg' })}
          >
            {t('ctaSecondary')}
          </Link>
        </div>

        <div className="mt-12 w-full max-w-4xl md:mt-14">
          <div
            className="relative aspect-video w-full overflow-hidden rounded-xl border border-ink bg-canvas"
            role="img"
            aria-label={t('visualLabel')}
          >
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-canvas px-6">
              <span className="font-display text-4xl text-ink/10 md:text-6xl">WA</span>
              <p className="text-sm font-medium text-mute">{t('visualPlaceholder')}</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
