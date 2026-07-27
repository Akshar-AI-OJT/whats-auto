import {
  FileKey2,
  Fingerprint,
  KeyRound,
  Lock,
  ScrollText,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { cn } from '@/lib/utils'
import { FeaturesReveal } from './FeaturesReveal'

const SECURITY_KEYS = [
  'oauth',
  'otp',
  'jwt',
  'rbac',
  'encrypted',
  'audit',
] as const

const SECURITY_ICONS: Record<(typeof SECURITY_KEYS)[number], LucideIcon> = {
  oauth: KeyRound,
  otp: Fingerprint,
  jwt: FileKey2,
  rbac: ShieldCheck,
  encrypted: Lock,
  audit: ScrollText,
}

export async function FeaturesSecurity() {
  const t = await getTranslations('featuresPage.security')

  return (
    <section className="relative overflow-x-clip bg-ink py-16 sm:py-20 md:py-24">
      <div
        aria-hidden
        className="pointer-events-none absolute top-0 left-1/4 size-[22rem] rounded-full bg-primary/15 blur-[120px]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute right-0 bottom-0 size-[18rem] rounded-full bg-primary/10 blur-[100px]"
      />

      <div className="relative z-10 mx-auto max-w-[1200px] px-4 sm:px-6">
        <FeaturesReveal className="mx-auto mb-10 max-w-2xl text-center md:mb-14">
          <h2 className="font-display text-3xl leading-tight tracking-tight text-canvas sm:text-4xl md:text-[2.75rem]">
            {t('title')}
          </h2>
          <p className="mt-4 text-base leading-7 text-canvas-soft/70 sm:text-lg">
            {t('subtitle')}
          </p>
        </FeaturesReveal>

        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:gap-5">
          {SECURITY_KEYS.map((key, i) => {
            const Icon = SECURITY_ICONS[key]
            const comingSoon = key === 'audit'

            return (
              <li key={key}>
                <FeaturesReveal delayMs={i * 50} className="h-full">
                  <article
                    className={cn(
                      'flex h-full flex-col rounded-[28px] border border-white/10 bg-white/5 p-6',
                      'shadow-[0_12px_40px_rgb(0_0_0/0.25)] backdrop-blur-md',
                      'transition-[transform,background-color,border-color] duration-200',
                      'hover:-translate-y-1 hover:border-primary/40 hover:bg-white/[0.08]'
                    )}
                  >
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <span className="flex size-11 items-center justify-center rounded-2xl bg-primary/15 text-primary">
                        <Icon className="size-5" aria-hidden />
                      </span>
                      {comingSoon ? (
                        <span className="rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-[10px] font-semibold text-primary">
                          {t('comingSoon')}
                        </span>
                      ) : null}
                    </div>
                    <h3 className="text-base font-semibold text-canvas sm:text-lg">
                      {t(`items.${key}.title`)}
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-canvas-soft/65">
                      {t(`items.${key}.description`)}
                    </p>
                  </article>
                </FeaturesReveal>
              </li>
            )
          })}
        </ul>
      </div>
    </section>
  )
}
