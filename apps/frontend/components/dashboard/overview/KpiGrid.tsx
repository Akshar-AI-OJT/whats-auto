'use client'

import { useEffect, useRef, useState } from 'react'
import { Megaphone, MessageCircle, Send, Users } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { api } from '@/lib/api'
import { useOrganizations } from '../OrganizationsProvider'
import { KPIStatCard } from './KPIStatCard'

function unwrapList<T>(data: { data?: T[] } | T[] | undefined): T[] {
  if (!data) return []
  if (Array.isArray(data)) return data
  if (Array.isArray(data.data)) return data.data
  return []
}

/**
 * Overview KPIs — contacts come from GET /api/v1/contacts.
 * Conversations / campaigns / delivery stay at 0 until those backends ship.
 */
export function KpiGrid() {
  const t = useTranslations('dashboard.home.kpis')
  const { tenantOrganizationId, isLoading: orgsLoading } = useOrganizations()
  const [contactsCount, setContactsCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const organizationIdRef = useRef(tenantOrganizationId)
  organizationIdRef.current = tenantOrganizationId

  useEffect(() => {
    if (orgsLoading) return

    let cancelled = false
    const orgId = tenantOrganizationId

    ;(async () => {
      if (!orgId) {
        if (!cancelled) {
          setContactsCount(0)
          setLoading(true)
        }
        return
      }

      setLoading(true)
      try {
        const { data } = await api.contacts.list()
        if (cancelled || orgId !== organizationIdRef.current) return
        const rows = unwrapList(data).filter((c) => c.organizationId === orgId)
        setContactsCount(rows.length)
      } catch {
        if (!cancelled && orgId === organizationIdRef.current) setContactsCount(0)
      } finally {
        if (!cancelled && orgId === organizationIdRef.current) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [tenantOrganizationId, orgsLoading])

  const items = [
    {
      key: 'contacts' as const,
      icon: Users,
      value: contactsCount,
      format: 'number' as const,
    },
    {
      key: 'conversations' as const,
      icon: MessageCircle,
      value: 0,
      format: 'number' as const,
    },
    {
      key: 'campaigns' as const,
      icon: Megaphone,
      value: 0,
      format: 'number' as const,
    },
    {
      key: 'delivery' as const,
      icon: Send,
      value: '—',
      format: 'plain' as const,
    },
  ]

  return (
    <div className="grid auto-rows-fr grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-4 xl:grid-cols-4 xl:gap-5">
      {items.map((item) => (
        <KPIStatCard
          key={item.key}
          label={t(`${item.key}.label`)}
          value={item.value}
          format={item.format}
          hint={t(`${item.key}.hint`)}
          icon={item.icon}
          loading={loading || orgsLoading}
          className="h-full"
        />
      ))}
    </div>
  )
}
