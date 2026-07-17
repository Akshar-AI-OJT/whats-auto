import { Link } from '@/i18n/navigation'
import { buttonVariants } from '@/components/ui/button'
import type { PricingTierData } from '@/components/pricing/types'
import { cn } from '@/lib/utils'

interface PricingCardProps {
  tier: PricingTierData
}

export function PricingCard({ tier }: PricingCardProps) {
  return (
    <article
      className={cn(
        'flex w-[85vw] shrink-0 snap-center flex-col rounded-xl p-6 md:w-auto',
        tier.highlighted
          ? 'bg-ink text-canvas'
          : 'bg-canvas-soft text-ink'
      )}
    >
      <h3 className="text-lg font-semibold">{tier.name}</h3>
      <div className="mt-4 flex items-baseline gap-1">
        <span className="font-display text-3xl tracking-tight md:text-4xl">
          {tier.price}
        </span>
        {tier.period ? (
          <span
            className={cn(
              'text-sm',
              tier.highlighted ? 'text-canvas-soft/70' : 'text-mute'
            )}
          >
            {tier.period}
          </span>
        ) : null}
      </div>
      <p
        className={cn(
          'mt-3 flex-1 text-sm md:text-base',
          tier.highlighted ? 'text-canvas-soft/80' : 'text-body'
        )}
      >
        {tier.description}
      </p>
      <Link
        href="/register"
        className={cn(
          buttonVariants({
            variant: tier.highlighted ? 'default' : 'outline',
          }),
          'mt-6 w-full',
          !tier.highlighted && 'border-ink bg-canvas'
        )}
      >
        {tier.cta}
      </Link>
    </article>
  )
}
