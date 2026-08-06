'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { FaWhatsapp } from 'react-icons/fa'
import { Link } from '@/i18n/navigation'
import { api, type WhatsappConfigSummary } from '@/lib/api'
import { cn } from '@/lib/utils'
import { buttonVariants } from '@/components/ui/button'
import { DashboardPanel } from '@/components/dashboard/ui/DashboardPanel'
import { useOrganizations } from '@/components/dashboard/OrganizationsProvider'
import { unwrapList } from '@/components/dashboard/inbox/inbox-utils'

export function ConnectWhatsappCard({ className }: { className?: string }) {
  const t = useTranslations('dashboard.home.connectWhatsapp')
  const { tenantOrganizationId, canViewWhatsapp, isLoading: orgsLoading } = useOrganizations()
  const [isWhatsappConnected, setIsWhatsappConnected] = useState(false)
  const [checked, setChecked] = useState(false)

  useEffect(() => {
    if (orgsLoading) return
    if (!tenantOrganizationId || !canViewWhatsapp) {
      setIsWhatsappConnected(false)
      setChecked(true)
      return
    }

    let cancelled = false
    const handle = window.setTimeout(() => {
      void (async () => {
        try {
          const { data } = await api.whatsapp.listConfigs()
          if (cancelled) return
          const configs = unwrapList<WhatsappConfigSummary>(data)
          setIsWhatsappConnected(configs.some((c) => c.status === 'connected'))
        } catch {
          if (!cancelled) setIsWhatsappConnected(false)
        } finally {
          if (!cancelled) setChecked(true)
        }
      })()
    }, 0)

    return () => {
      cancelled = true
      window.clearTimeout(handle)
    }
  }, [orgsLoading, tenantOrganizationId, canViewWhatsapp])

  if (!checked || isWhatsappConnected) return null

  return (
    <DashboardPanel
      as="section"
      className={cn(
        'relative overflow-hidden px-4 py-5 sm:px-6 sm:py-6',
        className
      )}
      aria-labelledby="connect-whatsapp-title"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -top-14 right-0 size-40 rounded-full bg-primary-pale/70 blur-[60px]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-16 left-8 size-32 rounded-full bg-canvas-soft/80 blur-[50px]"
      />

      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
        <div className="flex min-w-0 items-start gap-3.5 sm:gap-4">
          <span
            className={cn(
              'flex size-11 shrink-0 items-center justify-center rounded-xl',
              'bg-primary-pale text-positive-deep',
              'shadow-[0_4px_12px_rgb(159_232_112/0.2)]'
            )}
          >
            <FaWhatsapp className="size-5" aria-hidden />
          </span>

          <div className="min-w-0">
            <h2
              id="connect-whatsapp-title"
              className="font-display text-xl tracking-tight text-ink sm:text-2xl"
            >
              {t('title')}
            </h2>
            <p className="mt-1.5 max-w-xl text-sm leading-6 text-body">
              {t('description')}
            </p>
            <p className="mt-2 text-xs leading-5 text-mute">{t('secondary')}</p>
          </div>
        </div>

        <Link
          href="/dashboard/whatsapp"
          className={cn(buttonVariants({ size: 'sm' }), 'w-full shrink-0 sm:w-auto')}
        >
          {t('cta')}
        </Link>
      </div>
    </DashboardPanel>
  )
}
