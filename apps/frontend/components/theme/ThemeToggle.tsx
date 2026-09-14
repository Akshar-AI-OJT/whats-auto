'use client'

import { useSyncExternalStore } from 'react'
import { Moon, Sun } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import { useTheme } from './ThemeProvider'

type ThemeToggleProps = {
  className?: string
}
const emptySubscribe = () => () => {}

const toggleButtonClassName = cn(
  'relative inline-flex size-10 shrink-0 items-center justify-center rounded-xl border border-dash-border bg-canvas text-ink',
  'transition-[background-color,border-color,color,box-shadow] duration-200',
  'hover:border-dash-border-strong hover:bg-dash-surface'
)

export function ThemeToggle({ className }: ThemeToggleProps) {
  const t = useTranslations('dashboard.theme')
  const { resolvedTheme, toggleTheme } = useTheme()
  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  )

  // SSR + first client paint stay icon-stable; avoid hydration mismatch when
  // localStorage/theme script resolved dark before React hydrates.
  const isDark = mounted && resolvedTheme === 'dark'

  return (
    <button
      type="button"
      onClick={toggleTheme}
      title={isDark ? t('switchToLight') : t('switchToDark')}
      aria-label={isDark ? t('switchToLight') : t('switchToDark')}
      className={cn(toggleButtonClassName, className)}
    >
      <Sun
        className={cn(
          'size-4 transition-[transform,opacity] duration-200',
          isDark ? 'scale-75 opacity-0' : 'scale-100 opacity-100'
        )}
        aria-hidden
      />
      <Moon
        className={cn(
          'absolute size-4 transition-[transform,opacity] duration-200',
          isDark ? 'scale-100 opacity-100' : 'scale-75 opacity-0'
        )}
        aria-hidden
      />
    </button>
  )
}
