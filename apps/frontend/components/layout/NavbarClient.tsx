'use client'

import { useEffect, useState } from 'react'
import { ChevronDownIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { buttonVariants } from '@/components/ui/button'
import { Link } from '@/i18n/navigation'
import { LocaleSwitcher } from '@/components/layout/LocaleSwitcher'
import { MobileMenu } from '@/components/layout/MobileMenu'
import { MobileMenuTrigger } from '@/components/layout/MobileMenuTrigger'
import type { NavData, NavDropdown } from '@/components/layout/types'
import { cn } from '@/lib/utils'

interface NavbarClientProps {
  nav: NavData
}

function DesktopDropdown({ dropdown }: { dropdown: NavDropdown }) {
  const triggerClass =
    'inline-flex h-9 items-center rounded-xl text-sm font-semibold text-ink transition-colors hover:bg-canvas-soft'

  return (
    <div className="group relative inline-flex items-center">
      {dropdown.href ? (
        <Link
          href={dropdown.href}
          className={cn(triggerClass, 'gap-1 px-3')}
          aria-haspopup="true"
        >
          {dropdown.label}
          <ChevronDownIcon className="size-4 text-mute" />
        </Link>
      ) : (
        <button type="button" className={cn(triggerClass, 'gap-1 px-3')} aria-haspopup="true">
          {dropdown.label}
          <ChevronDownIcon className="size-4 text-mute" />
        </button>
      )}
      <div
        className={cn(
          'invisible absolute top-full left-0 z-50 pt-1 min-w-52',
          'group-hover:visible group-focus-within:visible'
        )}
      >
      <div
        className={cn(
          'rounded-xl border border-border bg-canvas p-1 opacity-0',
          'transition-opacity duration-150',
          'group-hover:opacity-100',
          'group-focus-within:opacity-100'
        )}
      >
        {dropdown.items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="block rounded-lg px-3 py-2 text-sm font-medium text-ink transition-colors hover:bg-canvas-soft"
          >
            {item.label}
          </Link>
        ))}
      </div>
      </div>
    </div>
  )
}

export function NavbarClient({ nav }: NavbarClientProps) {
  const t = useTranslations('nav')
  const [isOpen, setIsOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const menuId = 'mobile-nav-menu'

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 0)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <>
      <header
        className={cn(
          'sticky top-0 z-40 w-full bg-canvas transition-shadow',
          scrolled && 'shadow-[0_1px_0_0_var(--border)]'
        )}
      >
        <nav
          role="navigation"
          aria-label={t('mainNav')}
          className="mx-auto flex h-16 max-w-[1200px] items-center gap-4 px-4 md:px-6"
        >
          <Link
            href="/"
            className="font-display shrink-0 text-xl tracking-tight text-ink"
          >
            {nav.brand}
          </Link>

          <div className="hidden flex-1 items-center gap-1 md:flex">
            <Link
              href={nav.pricing.href}
              className="inline-flex h-9 items-center rounded-xl px-3 text-sm font-semibold text-ink transition-colors hover:bg-canvas-soft"
            >
              {nav.pricing.label}
            </Link>

            <DesktopDropdown dropdown={nav.features} />
            <DesktopDropdown dropdown={nav.integrations} />

            <div className="flex-1" />

            <Link href={nav.login.href} className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
              {nav.login.label}
            </Link>
            <Link href={nav.getStarted.href} className={buttonVariants({ size: 'sm' })}>
              {nav.getStarted.label}
            </Link>
            <LocaleSwitcher />
          </div>

          <div className="flex flex-1 justify-end md:hidden">
            <MobileMenuTrigger
              isOpen={isOpen}
              onClick={() => setIsOpen((open) => !open)}
              controlsId={menuId}
            />
          </div>
        </nav>
      </header>

      <div className="md:hidden">
        <MobileMenu id={menuId} open={isOpen} onOpenChange={setIsOpen} nav={nav} />
      </div>
    </>
  )
}
