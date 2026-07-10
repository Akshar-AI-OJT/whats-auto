import { getTranslations } from 'next-intl/server'
import { Link } from '@/i18n/navigation'
import { buttonVariants } from '@/components/ui/button'

export async function CTASection() {
  const t = await getTranslations('landing.cta')

  return (
    <section className="bg-primary text-primary-foreground">
      <div className="mx-auto flex max-w-screen-xl flex-col items-center gap-6 px-4 py-16 text-center md:py-20">
        <h2 className="text-2xl font-semibold tracking-tight md:text-4xl">
          {t('headline')}
        </h2>
        <p className="max-w-2xl text-base text-primary-foreground/85 md:text-lg">
          {t('subheadline')}
        </p>
        <Link
          href="/register"
          className={buttonVariants({
            size: 'lg',
            variant: 'secondary',
          })}
        >
          {t('button')}
        </Link>
      </div>
    </section>
  )
}
