'use client'

import { useEffect, useState } from 'react'
import {
  Building2,
  CreditCard,
  Headset,
  UserPlus,
  Wallet,
  Shield,
  type LucideIcon,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import { ActivityItem } from '@/components/dashboard/overview/ActivityItem'
import { DashboardPanel } from '@/components/dashboard/ui/DashboardPanel'
import { DashboardSectionHeader } from '@/components/dashboard/ui/DashboardSectionHeader'
import { fetchRecentAudit } from '../analytics/super-admin-analytics'
import type { AuthorizationAuditEvent } from '@/lib/api'

const EVENT_TYPE_MAP: Record<string, { icon: LucideIcon; tone: 'green' | 'blue' | 'amber' | 'neutral' }> = {
  'organization.created': { icon: Building2, tone: 'green' },
  'organization.updated': { icon: Building2, tone: 'blue' },
  'organization.deleted': { icon: Building2, tone: 'amber' },
  'subscription.created': { icon: CreditCard, tone: 'green' },
  'subscription.updated': { icon: CreditCard, tone: 'blue' },
  'user.invited': { icon: UserPlus, tone: 'blue' },
  'user.created': { icon: UserPlus, tone: 'green' },
  'user.deleted': { icon: UserPlus, tone: 'amber' },
  'payment.received': { icon: Wallet, tone: 'green' },
  'invoice.created': { icon: Wallet, tone: 'blue' },
  'support.ticket': { icon: Headset, tone: 'amber' },
}

const DEFAULT_MAPPING = { icon: Shield, tone: 'neutral' as const }

function mapAuditEvent(event: AuthorizationAuditEvent) {
  const mapping = EVENT_TYPE_MAP[event.eventType] ?? DEFAULT_MAPPING
  const title = event.eventType.replace(/[._]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
  const detail = [
    event.actorName ?? event.actorEmail ?? undefined,
    event.organizationName ? `· ${event.organizationName}` : '',
    event.reason ? `— ${event.reason}` : '',
  ]
    .filter(Boolean)
    .join(' ')

  return {
    id: event.id,
    title,
    detail: detail || title,
    timestamp: typeof event.createdAt === 'string' ? event.createdAt : new Date(event.createdAt).toISOString(),
    tone: mapping.tone,
    icon: mapping.icon,
  }
}

export function AdminRecentActivity() {
  const t = useTranslations('admin.home.activity')
  const [items, setItems] = useState<ReturnType<typeof mapAuditEvent>[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const events = await fetchRecentAudit()
        if (!cancelled) setItems(events.map(mapAuditEvent))
      } catch {
        if (!cancelled) setError(t('error'))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [t])

  return (
    <DashboardPanel as="section" className="flex h-full flex-col p-4 sm:p-5 md:p-6">
      <DashboardSectionHeader title={t('title')} description={t('description')} />

      {loading ? (
        <div className="mt-6 flex flex-1 items-center justify-center">
          <div className="size-6 animate-spin rounded-full border-2 border-dash-border border-t-primary" />
        </div>
      ) : error ? (
        <p className="mt-6 text-center text-sm text-mute">{error}</p>
      ) : items.length === 0 ? (
        <p className="mt-6 text-center text-sm text-mute">{t('emptyTitle')}</p>
      ) : (
        <ol className="mt-6 flex flex-1 flex-col">
          {items.map((item, index) => (
            <li key={item.id}>
              <ActivityItem
                id={item.id}
                title={item.title}
                detail={item.detail}
                timestamp={item.timestamp}
                tone={item.tone}
                icon={item.icon}
                isLast={index === items.length - 1}
              />
            </li>
          ))}
        </ol>
      )}
    </DashboardPanel>
  )
}
