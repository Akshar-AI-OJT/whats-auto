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
        'flex w-[85vw] shrink-0 snap-center flex-col rounded-xl border border-border bg-card p-6 md:w-auto',
        tier.highlighted &&
          'border-primary shadow-md ring-1 ring-primary/20 md:scale-[1.02]',
      )}
    >
      <h3 className="text-lg font-semibold">{tier.name}</h3>
      <div className="mt-4 flex items-baseline gap-1">
        <span className="text-3xl font-bold tracking-tight">{tier.price}</span>
        {tier.period ? (
          <span className="text-sm text-muted-foreground">{tier.period}</span>
        ) : null}
      </div>
      <p className="mt-3 flex-1 text-sm text-muted-foreground md:text-base">
        {tier.description}
      </p>
      <Link
        href="/register"
        className={cn(
          buttonVariants({
            variant: tier.highlighted ? 'default' : 'outline',
          }),
          'mt-6 w-full',
        )}
      >
        {tier.cta}
      </Link>
    </article>
  )
}
