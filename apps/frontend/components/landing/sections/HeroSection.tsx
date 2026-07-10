import { MessageCircle } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { Link } from '@/i18n/navigation'
import { buttonVariants } from '@/components/ui/button'

export async function HeroSection() {
  const t = await getTranslations('hero')

  return (
    <section className="border-b border-border">
      <div className="mx-auto grid max-w-screen-xl gap-10 px-4 py-16 md:grid-cols-2 md:items-center md:py-24 lg:py-28">
        <div className="flex flex-col gap-6">
          <h1 className="text-3xl font-semibold tracking-tight md:text-5xl lg:text-6xl">
            {t('headline')}
          </h1>
          <p className="text-base text-muted-foreground md:text-lg">
            {t('subheadline')}
          </p>
          <div>
            <Link href="/register" className={buttonVariants({ size: 'lg' })}>
              {t('cta')}
            </Link>
          </div>
        </div>

        <div
          aria-hidden
          className="relative mx-auto aspect-square w-full max-w-md rounded-2xl border border-border bg-linear-to-br from-primary/10 via-muted/50 to-primary/5 p-8 md:max-w-none"
        >
          <div className="flex h-full flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-border/80 bg-background/60 p-6 text-center">
            <div className="flex size-16 items-center justify-center rounded-2xl bg-primary/15 text-primary">
              <MessageCircle className="size-8" />
            </div>
            <p className="max-w-xs text-sm text-muted-foreground">
              {t('visualLabel')}
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
