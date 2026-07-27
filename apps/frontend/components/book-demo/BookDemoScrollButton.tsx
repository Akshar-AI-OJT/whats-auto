'use client'

import { ArrowRight } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { featuresPrimaryBtn } from '@/components/features/page/features-styles'

/** Scrolls to the booking section on the Book Demo page. */
export function BookDemoScrollButton({ label }: { label: string }) {
  return (
    <button
      type="button"
      className={cn(
        buttonVariants({ size: 'lg' }),
        featuresPrimaryBtn,
        'group justify-center'
      )}
      onClick={() => {
        document
          .getElementById('booking')
          ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }}
    >
      {label}
      <ArrowRight
        className="ml-1.5 size-4 transition-transform duration-200 group-hover:translate-x-0.5"
        aria-hidden
      />
    </button>
  )
}
