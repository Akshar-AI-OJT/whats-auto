'use client'

import { ArrowRight } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { featuresOutlineBtn } from './features-styles'

/** In-page scroll to Built for Real Workflows — does not change routes. */
export function FeaturesExploreButton({ label }: { label: string }) {
  return (
    <button
      type="button"
      className={cn(
        buttonVariants({ variant: 'outline', size: 'lg' }),
        featuresOutlineBtn,
        'group justify-center gap-2'
      )}
      onClick={() => {
        document
          .getElementById('built-for-workflows')
          ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }}
    >
      {label}
      <ArrowRight
        className="size-4 text-mute transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-ink"
        aria-hidden
      />
    </button>
  )
}
