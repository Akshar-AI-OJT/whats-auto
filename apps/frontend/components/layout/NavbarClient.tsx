'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { buttonVariants } from '@/components/ui/button'
import { Link, usePathname } from '@/i18n/navigation'
import { LocaleSwitcher } from '@/components/layout/LocaleSwitcher'
import { MobileMenu } from '@/components/layout/MobileMenu'
import { MobileMenuTrigger } from '@/components/layout/MobileMenuTrigger'
import type { NavAnchorLink, NavData } from '@/components/layout/types'
import { cn } from '@/lib/utils'

interface NavbarClientProps {
  nav: NavData
}

const loginButtonClassName = cn(
  buttonVariants({ variant: 'ghost', size: 'sm' }),
  'rounded-xl px-4 font-semibold text-ink transition-[transform,background-color,box-shadow,color] duration-300',
  'hover:-translate-y-px hover:bg-[#F1F5F9]',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2'
)

const getStartedClassName = cn(
  buttonVariants({ size: 'sm' }),
  'rounded-xl border-transparent bg-primary px-5 font-semibold text-on-primary',
  'shadow-[0_1px_2px_rgb(14_15_12/0.06),0_6px_14px_rgb(159_232_112/0.35)]',
  'transition-[transform,box-shadow,background] duration-300',
  'hover:-translate-y-px hover:bg-primary-active',
  'hover:shadow-[0_2px_4px_rgb(14_15_12/0.06),0_12px_24px_rgb(159_232_112/0.48)]',
  'active:translate-y-0',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2'
)

function navItemClassName(active: boolean) {
  return cn(
    'relative inline-flex h-9 cursor-pointer items-center rounded-xl px-3 text-sm font-medium',
    'transition-[color,background-color,transform] duration-300',
    'hover:bg-[#F1F5F9] hover:text-ink',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2',
    'after:pointer-events-none after:absolute after:inset-x-3 after:bottom-1 after:h-0.5 after:origin-center after:rounded-full after:bg-primary after:transition-transform after:duration-300 after:ease-out',
    active
      ? 'text-ink after:scale-x-100'
      : 'text-body after:scale-x-0 hover:after:scale-x-50'
  )
}

function scrollToSection(sectionId: string) {
  const el = document.getElementById(sectionId)
  if (!el) return false
  el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  history.replaceState(null, '', `#${sectionId}`)
  return true
}

function scrollToTop() {
  window.scrollTo({ top: 0, behavior: 'smooth' })
  history.replaceState(null, '', window.location.pathname)
}

function isFeaturesPath(pathname: string) {
  return pathname === '/features' || pathname.startsWith('/features/')
}

export function NavbarClient({ nav }: NavbarClientProps) {
  const t = useTranslations('nav')
  const pathname = usePathname()
  const [isOpen, setIsOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const [activeId, setActiveId] = useState<string | null>(null)
  const menuId = 'mobile-nav-menu'
  const isHome = pathname === '/'
  const onFeaturesPage = isFeaturesPath(pathname)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    window.addEventListener('scroll', onScroll, { passive: true })
    const raf = window.requestAnimationFrame(onScroll)
    return () => {
      window.cancelAnimationFrame(raf)
      window.removeEventListener('scroll', onScroll)
    }
  }, [])

  useEffect(() => {
    if (!isHome) return

    const landingAnchorLinks = nav.links.filter((link) => !link.isPageLink)
    if (landingAnchorLinks.length === 0) return

    const elements = landingAnchorLinks
      .map((link) => document.getElementById(link.sectionId))
      .filter((el): el is HTMLElement => Boolean(el))

    if (elements.length === 0) return

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)

        const id = visible[0]?.target?.id
        if (id) setActiveId(id)
      },
      {
        rootMargin: '-20% 0px -55% 0px',
        threshold: [0.1, 0.25, 0.5, 0.75],
      }
    )

    for (const el of elements) observer.observe(el)
    return () => observer.disconnect()
  }, [isHome, nav.links])

  useEffect(() => {
    if (!isOpen) return

    const previousOverflow = document.body.style.overflow
    const previousPadding = document.body.style.paddingRight
    const scrollbar = window.innerWidth - document.documentElement.clientWidth

    document.body.style.overflow = 'hidden'
    if (scrollbar > 0) {
      document.body.style.paddingRight = `${scrollbar}px`
    }

    return () => {
      document.body.style.overflow = previousOverflow
      document.body.style.paddingRight = previousPadding
    }
  }, [isOpen])

  const hrefFor = useCallback(
    (link: NavAnchorLink) => {
      if (link.isPageLink) return link.href

      if (isHome) return link.href
      return `/#${link.sectionId}`
    },
    [isHome]
  )

  const onNavClick = useCallback(
    (event: React.MouseEvent<HTMLAnchorElement>, link: NavAnchorLink) => {
      if (link.isPageLink && link.sectionId === 'features') {
        if (pathname === '/features') {
          event.preventDefault()
          scrollToTop()
        }
        // From home or other routes → navigate to /features (default)
        setIsOpen(false)
        return
      }

      if (isHome && !link.isPageLink) {
        event.preventDefault()
        scrollToSection(link.sectionId)
        setActiveId(link.sectionId)
      }

      setIsOpen(false)
    },
    [isHome, pathname]
  )

  const isLinkActive = (link: NavAnchorLink) => {
    if (link.isPageLink && link.sectionId === 'features') return onFeaturesPage
    return isHome && activeId === link.sectionId
  }

  return (
    <>
      <header
        className={cn(
          'sticky top-0 z-50 w-full transition-[background-color,box-shadow,border-color,backdrop-filter] duration-300',
          scrolled
            ? 'border-b border-[#E2E8F0]/80 bg-canvas/75 shadow-[0_8px_30px_rgb(15_23_42/0.06)] backdrop-blur-xl'
            : 'border-b border-transparent bg-transparent'
        )}
      >
        <nav
          role="navigation"
          aria-label={t('mainNav')}
          className={cn(
            'mx-auto flex max-w-[1200px] items-center gap-3 px-4 sm:gap-4 md:px-6',
            'transition-[height] duration-300 ease-out',
            scrolled ? 'h-[68px]' : 'h-20'
          )}
        >
          <Link
            href="/"
            className="font-display shrink-0 text-xl leading-none tracking-tight text-ink transition-opacity duration-300 hover:opacity-80 focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2"
          >
            {nav.brand}
          </Link>

          <div className="hidden flex-1 items-center gap-0.5 lg:flex">
            <div className="ml-6 flex items-center gap-0.5 xl:ml-8">
              {nav.links.map((link) => {
                const active = isLinkActive(link)
                const href = hrefFor(link)

                if (link.isPageLink) {
                  return (
                    <Link
                      key={link.sectionId}
                      href={href}
                      className={navItemClassName(active)}
                      aria-current={active ? 'page' : undefined}
                      onClick={(event) => onNavClick(event, link)}
                    >
                      {link.label}
                    </Link>
                  )
                }

                return (
                  <a
                    key={link.sectionId}
                    href={href}
                    className={navItemClassName(active)}
                    aria-current={active ? 'true' : undefined}
                    onClick={(event) => onNavClick(event, link)}
                  >
                    {link.label}
                  </a>
                )
              })}
            </div>

            <div className="flex-1" />

            <div className="flex items-center gap-2">
              <LocaleSwitcher />
              <Link href={nav.login.href} className={loginButtonClassName}>
                {nav.login.label}
              </Link>
              <Link href={nav.getStarted.href} className={getStartedClassName}>
                {nav.getStarted.label}
              </Link>
            </div>
          </div>

          <div className="flex flex-1 items-center justify-end gap-2 lg:hidden">
            <div className="hidden sm:block">
              <LocaleSwitcher />
            </div>
            <Link
              href={nav.getStarted.href}
              className={cn(getStartedClassName, 'hidden sm:inline-flex')}
            >
              {nav.getStarted.label}
            </Link>
            <MobileMenuTrigger
              isOpen={isOpen}
              onClick={() => setIsOpen((open) => !open)}
              controlsId={menuId}
            />
          </div>
        </nav>
      </header>

      <div className="lg:hidden">
        <MobileMenu
          id={menuId}
          open={isOpen}
          onOpenChange={setIsOpen}
          nav={nav}
          links={nav.links}
          activeId={
            onFeaturesPage ? 'features' : isHome ? activeId : null
          }
          onAnchorClick={onNavClick}
          homeHrefFor={hrefFor}
        />
      </div>
    </>
  )
}
