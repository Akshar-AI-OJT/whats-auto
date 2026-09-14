'use client'

import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { buttonVariants } from '@/components/ui/button'
import { Link } from '@/i18n/navigation'
import { AppLogo } from '@/components/branding/AppLogo'
import { LocaleSwitcher } from '@/components/layout/LocaleSwitcher'
import type { NavAnchorLink, NavData } from '@/components/layout/types'
import { cn } from '@/lib/utils'

interface MobileMenuProps {
  id: string
  open: boolean
  onOpenChange: (open: boolean) => void
  nav: NavData
  links: NavAnchorLink[]
  activeId: string | null
  onAnchorClick: (
    event: React.MouseEvent<HTMLAnchorElement>,
    link: NavAnchorLink
  ) => void
  homeHrefFor: (link: NavAnchorLink) => string
}

export function MobileMenu({
  id,
  open,
  onOpenChange,
  nav,
  links,
  activeId,
  onAnchorClick,
  homeHrefFor,
}: MobileMenuProps) {
  function closeMenu() {
    onOpenChange(false)
  }

  const itemClassName = (active: boolean) =>
    cn(
      'cursor-pointer rounded-xl px-3 py-3 text-base font-medium transition-[color,background-color] duration-300',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2',
      active ? 'bg-primary-pale/80 text-ink' : 'text-ink hover:bg-[#F1F5F9]'
    )

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        id={id}
        side="right"
        className={cn(
          'w-full gap-0 border-l border-[#E2E8F0] bg-canvas/95 p-0 backdrop-blur-xl duration-300 sm:max-w-sm',
          '!top-0 !right-0 !bottom-0 !h-auto',
          'data-[side=right]:!h-auto',
          'overflow-x-hidden overflow-y-auto overscroll-contain',
          'pt-[env(safe-area-inset-top,0px)]',
          'pb-[max(1rem,env(safe-area-inset-bottom,0px))]'
        )}
      >
        <SheetHeader className="border-b border-[#E2E8F0] px-5 py-4">
          <SheetTitle className="text-left">
            <AppLogo href="/" size="md" />
          </SheetTitle>
        </SheetHeader>

        {/* CTAs first — always in the initial viewport on every phone size */}
        <div className="flex flex-col gap-3 border-b border-[#E2E8F0] px-5 py-4">
          <Link
            href={nav.getStarted.href}
            onClick={closeMenu}
            className={cn(
              buttonVariants(),
              'w-full rounded-xl shadow-[0_1px_2px_rgb(14_15_12/0.06),0_8px_18px_rgb(37_99_235/0.35)] transition-[transform,box-shadow] duration-300 hover:-translate-y-px hover:shadow-[0_2px_4px_rgb(14_15_12/0.06),0_12px_24px_rgb(37_99_235/0.48)]'
            )}
          >
            {nav.getStarted.label}
          </Link>
          <Link
            href={nav.login.href}
            onClick={closeMenu}
            className={cn(
              buttonVariants({ variant: 'outline' }),
              'w-full rounded-xl border-[#E2E8F0] bg-canvas transition-[transform,background-color] duration-300 hover:-translate-y-px'
            )}
          >
            {nav.login.label}
          </Link>
        </div>

        <div className="border-b border-[#E2E8F0] px-5 py-4 sm:hidden">
          <LocaleSwitcher />
        </div>

        <nav aria-label={nav.brand} className="flex flex-col gap-1 px-5 py-4">
          {links.map((link) => {
            const active = activeId === link.sectionId
            const href = homeHrefFor(link)

            if (link.isPageLink) {
              return (
                <Link
                  key={link.sectionId}
                  href={href}
                  aria-current={active ? 'page' : undefined}
                  onClick={(event) => onAnchorClick(event, link)}
                  className={itemClassName(active)}
                >
                  {link.label}
                </Link>
              )
            }

            return (
              <a
                key={link.sectionId}
                href={href}
                aria-current={active ? 'true' : undefined}
                onClick={(event) => onAnchorClick(event, link)}
                className={itemClassName(active)}
              >
                {link.label}
              </a>
            )
          })}
        </nav>
      </SheetContent>
    </Sheet>
  )
}
