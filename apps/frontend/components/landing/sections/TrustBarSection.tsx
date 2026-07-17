import { getTranslations } from 'next-intl/server'

const TRUST_LOGOS = [
  { slug: 'shopify', label: 'Shopify' },
  { slug: 'meta', label: 'Meta' },
  { slug: 'slack', label: 'Slack' },
  { slug: 'hubspot', label: 'HubSpot' },
  { slug: 'zendesk', label: 'Zendesk' },
  { slug: 'notion', label: 'Notion' },
] as const

export async function TrustBarSection() {
  const t = await getTranslations('landing.trust')

  return (
    <section className="border-y border-border bg-canvas">
      <div className="mx-auto flex max-w-[1200px] flex-col items-center gap-6 px-4 py-8 md:px-6 md:py-10">
        <p className="text-sm font-medium text-mute">{t('label')}</p>
        <ul className="flex w-full flex-wrap items-center justify-center gap-x-10 gap-y-6 md:gap-x-14">
          {TRUST_LOGOS.map((logo) => (
            <li key={logo.slug} className="opacity-50 grayscale transition-opacity hover:opacity-80">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`https://cdn.simpleicons.org/${logo.slug}/0e0f0c`}
                alt={logo.label}
                width={88}
                height={28}
                className="h-6 w-auto md:h-7"
                loading="lazy"
              />
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
