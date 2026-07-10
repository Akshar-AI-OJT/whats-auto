'use client'

import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'

interface MobileMenuTriggerProps {
  isOpen: boolean
  onClick: () => void
  controlsId: string
}

export function MobileMenuTrigger({
  isOpen,
  onClick,
  controlsId,
}: MobileMenuTriggerProps) {
  const t = useTranslations('nav')

  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={isOpen}
      aria-controls={controlsId}
      aria-label={isOpen ? t('menuClose') : t('menuOpen')}
      className="inline-flex size-12 items-center justify-center rounded-md text-foreground transition-colors hover:bg-muted md:hidden"
    >
      <span className="relative block size-5" aria-hidden>
        <span
          className={cn(
            'absolute left-0 block h-0.5 w-5 rounded-full bg-current transition-all duration-200',
            isOpen ? 'top-2.5 rotate-45' : 'top-1',
          )}
        />
        <span
          className={cn(
            'absolute top-2.5 left-0 block h-0.5 w-5 rounded-full bg-current transition-all duration-200',
            isOpen ? 'scale-x-0 opacity-0' : 'opacity-100',
          )}
        />
        <span
          className={cn(
            'absolute left-0 block h-0.5 w-5 rounded-full bg-current transition-all duration-200',
            isOpen ? 'top-2.5 -rotate-45' : 'top-4',
          )}
        />
      </span>
    </button>
  )
}
