'use client'

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { buttonVariants } from '@/components/ui/button'
import { Link } from '@/i18n/navigation'
import { LocaleSwitcher } from '@/components/layout/LocaleSwitcher'
import type { NavData } from '@/components/layout/types'
import { cn } from '@/lib/utils'

interface MobileMenuProps {
  id: string
  open: boolean
  onOpenChange: (open: boolean) => void
  nav: NavData
}

function NavMenuSection({
  dropdown,
  onNavigate,
}: {
  dropdown: NavData['features'] | NavData['integrations']
  onNavigate: () => void
}) {
  return (
    <AccordionItem value={dropdown.id}>
      <AccordionTrigger className="py-3 text-base hover:no-underline">
        {dropdown.label}
      </AccordionTrigger>
      <AccordionContent className="pb-0">
        <ul className="flex flex-col">
          {dropdown.items.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                onClick={onNavigate}
                className="block py-3 pl-2 text-body transition-colors hover:text-ink"
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </AccordionContent>
    </AccordionItem>
  )
}

export function MobileMenu({ id, open, onOpenChange, nav }: MobileMenuProps) {
  function closeMenu() {
    onOpenChange(false)
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent id={id} side="right" className="w-full gap-0 border-l border-border bg-canvas p-0 sm:max-w-sm">
        <SheetHeader className="border-b border-border px-4 py-4">
          <SheetTitle className="font-display text-left text-lg text-ink">
            {nav.brand}
          </SheetTitle>
        </SheetHeader>

        <div className="flex flex-1 flex-col overflow-y-auto px-4 py-2">
          <Link href={nav.pricing.href} onClick={closeMenu} className="py-3 text-base font-medium">
            {nav.pricing.label}
          </Link>

          <Accordion>
            <NavMenuSection dropdown={nav.features} onNavigate={closeMenu} />
            <NavMenuSection dropdown={nav.integrations} onNavigate={closeMenu} />
          </Accordion>

          <div className="my-4 border-t border-border" />

          <div className="mt-auto flex flex-col gap-3 py-4">
            <Link
              href={nav.getStarted.href}
              onClick={closeMenu}
              className={cn(buttonVariants(), 'w-full')}
            >
              {nav.getStarted.label}
            </Link>
            <Link
              href={nav.login.href}
              onClick={closeMenu}
              className={cn(buttonVariants({ variant: 'outline' }), 'w-full')}
            >
              {nav.login.label}
            </Link>
            <div className="py-2">
              <LocaleSwitcher />
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
