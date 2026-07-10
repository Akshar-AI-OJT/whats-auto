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
  return (
    <div className="group relative">
      <button
        type="button"
        className="inline-flex h-9 items-center gap-1 rounded-md px-3 text-sm font-medium transition-colors hover:bg-muted"
        aria-haspopup="true"
      >
        {dropdown.label}
        <ChevronDownIcon className="size-4 text-muted-foreground" />
      </button>
      <div
        className={cn(
          'invisible absolute top-full left-0 z-50 mt-1 min-w-52 rounded-md border border-border bg-popover p-1 opacity-0 shadow-md',
          'transition-all duration-150',
          'group-hover:visible group-hover:opacity-100',
          'group-focus-within:visible group-focus-within:opacity-100'
        )}
      >
        {dropdown.items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="block rounded-sm px-3 py-2 text-sm transition-colors hover:bg-muted"
          >
            {item.label}
          </Link>
        ))}
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
          'sticky top-0 z-40 w-full border-b border-transparent bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/80 transition-shadow',
          scrolled && 'border-border shadow-sm'
        )}
      >
        <nav
          role="navigation"
          aria-label={t('mainNav')}
          className="mx-auto flex h-16 max-w-screen-xl items-center gap-4 px-4"
        >
          <Link href="/" className="shrink-0 text-lg font-semibold tracking-tight">
            {nav.brand}
          </Link>

          <div className="hidden flex-1 items-center gap-1 md:flex">
            <Link
              href={nav.pricing.href}
              className="inline-flex h-9 items-center rounded-md px-3 text-sm font-medium transition-colors hover:bg-muted"
            >
              {nav.pricing.label}
            </Link>

            <DesktopDropdown dropdown={nav.features} />
            <DesktopDropdown dropdown={nav.integrations} />

            <div className="flex-1" />

            <Link href={nav.getStarted.href} className={buttonVariants()}>
              {nav.getStarted.label}
            </Link>

            <Link href={nav.login.href} className={buttonVariants({ variant: 'outline' })}>
              {nav.login.label}
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
