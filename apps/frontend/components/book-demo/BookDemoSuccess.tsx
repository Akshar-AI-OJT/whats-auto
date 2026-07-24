'use client'

import { Check, Home, RotateCcw } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { buttonVariants } from '@/components/ui/button'
import {
  featuresOutlineBtn,
  featuresPrimaryBtn,
} from '@/components/features/page/features-styles'
import { cn } from '@/lib/utils'

const NEXT_KEYS = ['email', 'meet', 'reminder', 'contact'] as const

type BookDemoSuccessProps = {
  dateLabel: string
  timeLabel: string
  onBookAnother: () => void
}

export function BookDemoSuccess({
  dateLabel,
  timeLabel,
  onBookAnother,
}: BookDemoSuccessProps) {
  const t = useTranslations('bookDemoPage.booking.success')

  const summaryItems = [
    { emoji: '📅', label: t('summary.date'), value: dateLabel },
    { emoji: '🕑', label: t('summary.time'), value: timeLabel },
    { emoji: '⌛', label: t('summary.duration'), value: t('summary.durationValue') },
    { emoji: '📍', label: t('summary.platform'), value: t('summary.platformValue') },
  ] as const

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'animate-hero-fade-up mx-auto w-full max-w-3xl',
        'rounded-3xl border border-[#E2E8F0] bg-canvas/90 px-6 py-10 text-center backdrop-blur-sm sm:px-10 sm:py-12',
        'shadow-[0_1px_2px_rgb(15_23_42/0.04),0_24px_60px_rgb(15_23_42/0.08)]'
      )}
    >
      <div
        aria-hidden
        className={cn(
          'mx-auto mb-5 flex size-16 items-center justify-center rounded-full sm:size-[4.5rem]',
          'bg-primary-pale text-3xl sm:text-4xl',
          'shadow-[0_0_0_6px_rgb(159_232_112/0.18),0_12px_28px_rgb(159_232_112/0.35)]',
          'animate-hero-float'
        )}
      >
        🎉
      </div>

      <h2 className="font-display text-2xl leading-tight tracking-tight text-ink sm:text-3xl md:text-[2.25rem]">
        {t('title')}
      </h2>
      <p className="mt-3 text-base leading-7 text-body sm:text-lg sm:leading-8">
        {t('subtitle')}
      </p>

      <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {summaryItems.map((item) => (
          <div
            key={item.label}
            className={cn(
              'rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC]/90 px-4 py-4 text-left',
              'shadow-[0_1px_2px_rgb(15_23_42/0.03)]',
              'transition-[transform,box-shadow,border-color] duration-200',
              'hover:-translate-y-0.5 hover:border-primary/40',
              'hover:shadow-[0_8px_20px_rgb(15_23_42/0.06),0_0_0_3px_rgb(159_232_112/0.12)]'
            )}
          >
            <p className="flex items-center gap-2 text-xs font-semibold tracking-wide text-mute uppercase">
              <span aria-hidden>{item.emoji}</span>
              {item.label}
            </p>
            <p className="mt-1.5 text-sm font-semibold text-ink sm:text-base">
              {item.value}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-10 text-left">
        <h3 className="text-center text-sm font-semibold tracking-wide text-ink uppercase">
          {t('whatsNext')}
        </h3>
        <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {NEXT_KEYS.map((key) => (
            <li
              key={key}
              className={cn(
                'flex items-start gap-3 rounded-2xl border border-[#E2E8F0] bg-canvas px-4 py-3.5',
                'shadow-[0_1px_2px_rgb(15_23_42/0.03)]',
                'transition-[transform,border-color,box-shadow] duration-200',
                'hover:-translate-y-0.5 hover:border-primary/45',
                'hover:shadow-[0_0_0_3px_rgb(159_232_112/0.14)]'
              )}
            >
              <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-on-primary shadow-[0_4px_12px_rgb(159_232_112/0.35)]">
                <Check className="size-3.5" strokeWidth={2.75} aria-hidden />
              </span>
              <span className="text-sm leading-6 font-medium text-body">
                {t(`next.${key}`)}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-9 flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-center">
        <Link
          href="/"
          className={cn(
            buttonVariants({ size: 'lg' }),
            featuresPrimaryBtn,
            'group justify-center gap-2'
          )}
        >
          <Home className="size-4" aria-hidden />
          {t('backHome')}
        </Link>
        <button
          type="button"
          onClick={onBookAnother}
          className={cn(
            buttonVariants({ variant: 'outline', size: 'lg' }),
            featuresOutlineBtn,
            'justify-center gap-2 bg-canvas'
          )}
        >
          <RotateCcw className="size-4" aria-hidden />
          {t('bookAnother')}
        </button>
      </div>
    </div>
  )
}
