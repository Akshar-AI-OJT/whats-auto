'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import {
  api,
  type ApiError,
  type Notification,
  type PaginationMeta,
} from '@/lib/api'
import { useOrganizations } from '@/components/dashboard/OrganizationsProvider'
import {
  unwrapNotification,
  unwrapNotificationsPaginated,
} from '../notification-utils'

const PER_PAGE = 20

type UseNotificationsOptions = {
  /** When false, skips automatic loading (e.g. bell panel closed). */
  enabled?: boolean
}

export function useNotifications(options: UseNotificationsOptions = {}) {
  const { enabled = true } = options
  const t = useTranslations('dashboard.notifications')
  const { tenantOrganizationId, isLoading: orgsLoading } = useOrganizations()

  const [items, setItems] = useState<Notification[]>([])
  const [meta, setMeta] = useState<PaginationMeta | null>(null)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [markingAll, setMarkingAll] = useState(false)
  const [markingId, setMarkingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const organizationIdRef = useRef(tenantOrganizationId)
  organizationIdRef.current = tenantOrganizationId

  const unreadCount = items.filter((item) => !item.readAt).length
  const lastPage = meta?.lastPage ?? 1
  const total = meta?.total ?? items.length
  const hasMore = page < lastPage

  const fetchPage = useCallback(
    async (organizationId: string, nextPage: number, append: boolean) => {
      if (append) {
        setLoadingMore(true)
      } else {
        setLoading(true)
      }
      setError(null)

      try {
        const res = await api.notifications.list({
          page: nextPage,
          limit: PER_PAGE,
        })

        if (organizationId !== organizationIdRef.current) return

        const { items: nextItems, meta: nextMeta } = unwrapNotificationsPaginated(res.data)
        setItems((prev) => (append ? [...prev, ...nextItems] : nextItems))
        setMeta(nextMeta)
        setPage(nextMeta?.currentPage ?? nextPage)
      } catch (err) {
        if (organizationId !== organizationIdRef.current) return
        setError((err as ApiError).message || t('loadFailed'))
        if (!append) setItems([])
      } finally {
        if (organizationId === organizationIdRef.current) {
          setLoading(false)
          setLoadingMore(false)
        }
      }
    },
    [t]
  )

  const refresh = useCallback(() => {
    if (!tenantOrganizationId) return
    void fetchPage(tenantOrganizationId, 1, false)
  }, [fetchPage, tenantOrganizationId])

  const loadMore = useCallback(() => {
    if (!tenantOrganizationId || !hasMore || loadingMore) return
    void fetchPage(tenantOrganizationId, page + 1, true)
  }, [fetchPage, hasMore, loadingMore, page, tenantOrganizationId])

  const goToPage = useCallback(
    (nextPage: number) => {
      if (!tenantOrganizationId || nextPage < 1 || nextPage > lastPage) return
      void fetchPage(tenantOrganizationId, nextPage, false)
    },
    [fetchPage, lastPage, tenantOrganizationId]
  )

  useEffect(() => {
    if (!enabled || orgsLoading) return
    if (!tenantOrganizationId) {
      setItems([])
      setMeta(null)
      setError(null)
      return
    }
    void fetchPage(tenantOrganizationId, 1, false)
  }, [enabled, orgsLoading, tenantOrganizationId, fetchPage])

  const markAllAsRead = useCallback(async () => {
    if (markingAll || unreadCount === 0) return

    setMarkingAll(true)
    setError(null)
    const readAt = new Date().toISOString()

    try {
      await api.notifications.markAllAsRead()
      setItems((prev) =>
        prev.map((item) => (item.readAt ? item : { ...item, readAt }))
      )
    } catch (err) {
      setError((err as ApiError).message || t('markAllFailed'))
    } finally {
      setMarkingAll(false)
    }
  }, [markingAll, t, unreadCount])

  const markAsRead = useCallback(
    async (item: Notification) => {
      if (item.readAt || markingId) return

      setMarkingId(item.id)
      const optimisticReadAt = new Date().toISOString()
      setItems((prev) =>
        prev.map((entry) =>
          entry.id === item.id ? { ...entry, readAt: optimisticReadAt } : entry
        )
      )

      try {
        const res = await api.notifications.markAsRead(item.id)
        const updated = unwrapNotification(res.data)
        if (updated) {
          setItems((prev) =>
            prev.map((entry) => (entry.id === item.id ? updated : entry))
          )
        }
      } catch (err) {
        setItems((prev) =>
          prev.map((entry) =>
            entry.id === item.id ? { ...entry, readAt: null } : entry
          )
        )
        setError((err as ApiError).message || t('markReadFailed'))
      } finally {
        setMarkingId(null)
      }
    },
    [markingId, t]
  )

  return {
    items,
    meta,
    page,
    lastPage,
    total,
    loading,
    loadingMore,
    markingAll,
    markingId,
    error,
    unreadCount,
    hasMore,
    refresh,
    loadMore,
    goToPage,
    markAllAsRead,
    markAsRead,
  }
}
