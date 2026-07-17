import { getTranslations } from 'next-intl/server'
import { Link } from '@/i18n/navigation'
import { buttonVariants } from '@/components/ui/button'

export async function CTASection() {
  const t = await getTranslations('landing.cta')

  return (
    <section className="bg-ink text-primary">
      <div className="mx-auto flex max-w-[1200px] flex-col items-center gap-6 px-4 py-16 text-center md:px-6 md:py-20">
        <h2 className="font-display-black max-w-3xl text-3xl md:text-5xl">
          {t('headline')}
        </h2>
        <p className="max-w-xl text-base text-canvas-soft/80 md:text-lg">
          {t('subheadline')}
        </p>
        <Link href="/register" className={buttonVariants({ size: 'lg' })}>
          {t('button')}
        </Link>
      </div>
    </section>
  )
}
