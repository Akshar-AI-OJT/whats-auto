import { Mail } from 'lucide-react'
import { FaGithub, FaLinkedin, FaXTwitter } from 'react-icons/fa6'
import { getTranslations } from 'next-intl/server'
import { Link } from '@/i18n/navigation'
import { cn } from '@/lib/utils'

type FooterLink =
  | { labelKey: string; href: string; soon?: false }
  | { labelKey: string; soon: true }

const PRODUCT_LINKS: FooterLink[] = [
  { labelKey: 'features', href: '/features' },
  { labelKey: 'pricing', href: '/pricing' },
  { labelKey: 'security', href: '/features' },
  { labelKey: 'roadmap', soon: true },
]

const COMPANY_LINKS: FooterLink[] = [
  { labelKey: 'about', href: '/about' },
  { labelKey: 'contact', href: 'mailto:hello@whats-auto.com' },
  { labelKey: 'privacy', href: '/privacy' },
  { labelKey: 'terms', href: '/terms' },
]

const RESOURCE_LINKS: FooterLink[] = [
  { labelKey: 'support', href: 'mailto:support@whats-auto.com' },
  { labelKey: 'faqs', href: '/#faq' },
]

const SOCIAL = [
  {
    key: 'linkedin' as const,
    href: 'https://www.linkedin.com/',
    Icon: FaLinkedin,
  },
  {
    key: 'github' as const,
    href: 'https://github.com/',
    Icon: FaGithub,
  },
  {
    key: 'twitter' as const,
    href: 'https://x.com/',
    Icon: FaXTwitter,
  },
  {
    key: 'email' as const,
    href: 'mailto:hello@whats-auto.com',
    Icon: Mail,
  },
] as const

function FooterNavItem({
  link,
  label,
  soonLabel,
}: {
  link: FooterLink
  label: string
  soonLabel: string
}) {
  if (link.soon) {
    return (
      <span
        className="inline-flex cursor-not-allowed items-center gap-2 text-sm text-mute opacity-60"
        aria-disabled="true"
      >
        {label}
        <span className="rounded-full border border-[#E2E8F0] bg-[#F8FAFC] px-1.5 py-0.5 text-[9px] font-semibold tracking-wide text-mute uppercase">
          {soonLabel}
        </span>
      </span>
    )
  }

  const className =
    'cursor-pointer text-sm text-body transition-colors duration-200 hover:text-positive-deep'

  if (link.href.startsWith('mailto:') || link.href.startsWith('http')) {
    return (
      <a
        href={link.href}
        className={className}
        {...(link.href.startsWith('http')
          ? { target: '_blank', rel: 'noopener noreferrer' }
          : {})}
      >
        {label}
      </a>
    )
  }

  return (
    <Link href={link.href} className={className}>
      {label}
    </Link>
  )
}

export async function Footer() {
  const t = await getTranslations('footer')
  const year = new Date().getFullYear()
  const soonLabel = t('soon')

  return (
    <footer
      id="contact"
      className="scroll-mt-24 border-t border-[#E2E8F0] bg-[#F8FAFC]"
    >
      <div className="mx-auto max-w-[1200px] px-4 py-14 sm:px-6 md:py-16 lg:py-20">
        <div className="grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-4 lg:gap-12">
          <div className="sm:col-span-2 lg:col-span-1">
            <Link
              href="/"
              className="font-display text-xl tracking-tight text-ink transition-opacity duration-200 hover:opacity-80"
            >
              {t('brand')}
            </Link>
            <p className="mt-4 max-w-sm text-sm leading-6 text-body">
              {t('description')}
            </p>
            <ul className="mt-6 flex items-center gap-2.5">
              {SOCIAL.map(({ key, href, Icon }) => (
                <li key={key}>
                  <a
                    href={href}
                    aria-label={t(`social.${key}`)}
                    {...(href.startsWith('http')
                      ? { target: '_blank', rel: 'noopener noreferrer' }
                      : {})}
                    className={cn(
                      'flex size-10 cursor-pointer items-center justify-center rounded-xl border border-[#E2E8F0] bg-canvas text-body',
                      'shadow-[0_1px_2px_rgb(15_23_42/0.04)]',
                      'transition-[transform,color,border-color,box-shadow,background-color] duration-200',
                      'hover:-translate-y-0.5 hover:border-primary/50 hover:bg-primary-pale hover:text-positive-deep',
                      'hover:shadow-[0_8px_20px_rgb(37_99_235/0.25)]'
                    )}
                  >
                    <Icon className="size-4" aria-hidden />
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="text-sm font-semibold text-ink">{t('columns.product.title')}</p>
            <ul className="mt-4 flex flex-col gap-3">
              {PRODUCT_LINKS.map((link) => (
                <li key={link.labelKey}>
                  <FooterNavItem
                    link={link}
                    soonLabel={soonLabel}
                    label={t(`columns.product.links.${link.labelKey}`)}
                  />
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="text-sm font-semibold text-ink">{t('columns.company.title')}</p>
            <ul className="mt-4 flex flex-col gap-3">
              {COMPANY_LINKS.map((link) => (
                <li key={link.labelKey}>
                  <FooterNavItem
                    link={link}
                    soonLabel={soonLabel}
                    label={t(`columns.company.links.${link.labelKey}`)}
                  />
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="text-sm font-semibold text-ink">
              {t('columns.resources.title')}
            </p>
            <ul className="mt-4 flex flex-col gap-3">
              {RESOURCE_LINKS.map((link) => (
                <li key={link.labelKey}>
                  <FooterNavItem
                    link={link}
                    soonLabel={soonLabel}
                    label={t(`columns.resources.links.${link.labelKey}`)}
                  />
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-12 border-t border-[#E2E8F0] pt-8 sm:mt-14">
          <p className="text-xs leading-5 text-mute sm:text-sm">
            {t('copyright', { year })}
          </p>
        </div>
      </div>
    </footer>
  )
}
