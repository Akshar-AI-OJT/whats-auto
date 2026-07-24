'use client'

import { useEffect, useState } from 'react'
import {
  ChevronDown,
  Cookie,
  FileText,
  Gavel,
  Lock,
  Mail,
  Scale,
  Server,
  Share2,
  Shield,
  User,
  UserCheck,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'

export type LegalNavItem = {
  id: string
  label: string
  icon?: LucideIcon
}

const DEFAULT_ICONS: Record<string, LucideIcon> = {
  collect: FileText,
  use: Share2,
  protection: Shield,
  cookies: Cookie,
  thirdParty: Server,
  rights: UserCheck,
  updates: FileText,
  'privacy-contact': Mail,
  acceptance: Scale,
  accounts: User,
  acceptableUse: Shield,
  intellectualProperty: Lock,
  availability: Server,
  liability: Gavel,
  governingLaw: Scale,
  'terms-contact': Mail,
}

type LegalQuickNavProps = {
  items: LegalNavItem[]
  title: string
  mobileTitle: string
}

export function LegalQuickNav({ items, title, mobileTitle }: LegalQuickNavProps) {
  const [activeId, setActiveId] = useState(items[0]?.id ?? '')
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const elements = items
      .map((item) => document.getElementById(item.id))
      .filter((el): el is HTMLElement => Boolean(el))

    if (elements.length === 0) return

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort(
            (a, b) =>
              (a.target as HTMLElement).offsetTop -
              (b.target as HTMLElement).offsetTop
          )

        if (visible[0]?.target.id) {
          setActiveId(visible[0].target.id)
        }
      },
      {
        rootMargin: '-20% 0px -55% 0px',
        threshold: [0, 0.1, 0.25],
      }
    )

    for (const el of elements) observer.observe(el)
    return () => observer.disconnect()
  }, [items])

  function scrollToSection(id: string) {
    const el = document.getElementById(id)
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    setActiveId(id)
    setOpen(false)
  }

  return (
    <div className="w-full lg:w-auto">
      {/* Mobile accordion */}
      <div className="mb-2 lg:hidden">
        <div
          className={cn(
            'overflow-hidden rounded-[24px] border border-[#E2E8F0] bg-canvas/90 backdrop-blur-sm',
            'shadow-[0_1px_2px_rgb(15_23_42/0.04),0_12px_32px_rgb(15_23_42/0.05)]'
          )}
        >
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left"
          >
            <span className="text-sm font-semibold tracking-tight text-ink">
              {mobileTitle}
            </span>
            <ChevronDown
              className={cn(
                'size-4 shrink-0 text-mute transition-transform duration-200',
                open && 'rotate-180'
              )}
              aria-hidden
            />
          </button>
          <div
            className={cn(
              'grid transition-[grid-template-rows] duration-300 ease-out',
              open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
            )}
          >
            <div className="overflow-hidden">
              <nav
                aria-label={mobileTitle}
                className="border-t border-[#E2E8F0] px-2 py-2"
              >
                <NavList
                  items={items}
                  activeId={activeId}
                  onSelect={scrollToSection}
                />
              </nav>
            </div>
          </div>
        </div>
      </div>

      {/* Desktop sticky sidebar */}
      <aside className="relative z-20 hidden lg:block">
        <div
          className={cn(
            'sticky top-24 max-h-[calc(100dvh-7rem)] overflow-y-auto',
            'rounded-[24px] border border-[#E2E8F0] bg-canvas/90 p-4 backdrop-blur-sm',
            'shadow-[0_1px_2px_rgb(15_23_42/0.04),0_12px_32px_rgb(15_23_42/0.05)]'
          )}
        >
          <p className="mb-3 px-2 text-xs font-semibold tracking-wide text-mute uppercase">
            {title}
          </p>
          <nav aria-label={title}>
            <NavList
              items={items}
              activeId={activeId}
              onSelect={scrollToSection}
            />
          </nav>
        </div>
      </aside>
    </div>
  )
}

function NavList({
  items,
  activeId,
  onSelect,
}: {
  items: LegalNavItem[]
  activeId: string
  onSelect: (id: string) => void
}) {
  return (
    <ul className="space-y-0.5">
      {items.map((item) => {
        const Icon = item.icon ?? DEFAULT_ICONS[item.id] ?? FileText
        const active = activeId === item.id

        return (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => onSelect(item.id)}
              aria-current={active ? 'true' : undefined}
              className={cn(
                'group flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-sm transition-[background-color,color,transform,box-shadow] duration-200',
                active
                  ? 'bg-primary-pale font-semibold text-positive-deep shadow-[0_0_0_1px_rgb(159_232_112/0.35)]'
                  : 'font-medium text-body hover:translate-x-0.5 hover:bg-[#F8FAFC] hover:text-ink'
              )}
            >
              <span
                className={cn(
                  'flex size-7 shrink-0 items-center justify-center rounded-lg transition-[background-color,color,box-shadow] duration-200',
                  active
                    ? 'bg-primary text-on-primary shadow-[0_4px_12px_rgb(159_232_112/0.35)]'
                    : 'bg-[#F8FAFC] text-mute group-hover:text-positive-deep'
                )}
              >
                <Icon className="size-3.5" aria-hidden />
              </span>
              <span className="min-w-0 leading-snug">{item.label}</span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
