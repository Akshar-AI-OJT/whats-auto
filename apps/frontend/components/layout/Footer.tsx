import { getTranslations } from 'next-intl/server'
import { Link } from '@/i18n/navigation'

const FOOTER_COLUMNS = [
  {
    key: 'product' as const,
    links: [
      { href: '/features', labelKey: 'features' as const },
      { href: '/pricing', labelKey: 'pricing' as const },
      { href: '/integrations/shopify', labelKey: 'integrations' as const },
    ],
  },
  {
    key: 'company' as const,
    links: [
      { href: '/register', labelKey: 'getStarted' as const },
      { href: '/login', labelKey: 'login' as const },
    ],
  },
  {
    key: 'resources' as const,
    links: [
      { href: '/features/whatsapp-automation', labelKey: 'automation' as const },
      { href: '/features/smart-replies', labelKey: 'smartReplies' as const },
    ],
  },
] as const

export async function Footer() {
  const t = await getTranslations('footer')
  const year = new Date().getFullYear()

  return (
    <footer className="bg-ink text-canvas-soft">
      <div className="mx-auto max-w-[1200px] px-4 py-12 md:px-6 md:py-16">
        <div className="grid grid-cols-2 gap-10 md:grid-cols-4 md:gap-8">
          <div className="col-span-2 md:col-span-1">
            <Link href="/" className="font-display text-xl text-primary">
              {t('brand')}
            </Link>
            <p className="mt-3 max-w-xs text-sm leading-6 text-canvas-soft/70">
              {t('tagline')}
            </p>
          </div>

          {FOOTER_COLUMNS.map((col) => (
            <div key={col.key}>
              <p className="text-sm font-semibold text-canvas">{t(`columns.${col.key}.title`)}</p>
              <ul className="mt-4 flex flex-col gap-3">
                {col.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-sm text-canvas-soft/70 transition-colors hover:text-primary"
                    >
                      {t(`columns.${col.key}.links.${link.labelKey}`)}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-col gap-4 border-t border-canvas-soft/15 pt-8 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-canvas-soft/50">
            {t('copyright', { year })}
          </p>
          <div className="flex gap-4 text-xs text-canvas-soft/50">
            <span>{t('legal.privacy')}</span>
            <span>{t('legal.terms')}</span>
          </div>
        </div>
      </div>
    </footer>
  )
}
