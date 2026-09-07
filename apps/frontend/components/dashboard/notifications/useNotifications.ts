'use client'

import { useCallback, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { api, type ApiError, type Notification, type PaginationMeta } from '@/lib/api'
import { queryKeys } from '@/lib/query-keys'
import { useOrganizations } from '@/components/dashboard/OrganizationsProvider'
import { unwrapNotification, unwrapNotificationsPaginated } from '../notification-utils'

const PER_PAGE = 20

type NotificationsFeed = {
  items: Notification[]
  meta: PaginationMeta | null
  page: number
}

type UseNotificationsOptions = {
  /** When false, skips automatic loading (e.g. bell panel closed). */
  enabled?: boolean
}

export function useNotifications(options: UseNotificationsOptions = {}) {
  const { enabled = true } = options
  const t = useTranslations('dashboard.notifications')
  const queryClient = useQueryClient()
  const { tenantOrganizationId, isLoading: orgsLoading, hasFullProductAccess } = useOrganizations()

  const feedKey = useMemo(
    () => [...queryKeys.notifications.all(tenantOrganizationId), 'feed'] as const,
    [tenantOrganizationId]
  )
  const allKey = queryKeys.notifications.all(tenantOrganizationId)

  const [loadingMore, setLoadingMore] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const listQuery = useQuery({
    queryKey: feedKey,
    queryFn: async (): Promise<NotificationsFeed> => {
      const res = await api.notifications.list({ page: 1, limit: PER_PAGE })
      const parsed = unwrapNotificationsPaginated(res.data)
      return {
        items: parsed.items,
        meta: parsed.meta,
        page: parsed.meta?.currentPage ?? 1,
      }
    },
    enabled: enabled && !orgsLoading && Boolean(tenantOrganizationId) && hasFullProductAccess,
    staleTime: 30_000,
  })

  const items = listQuery.data?.items ?? []
  const meta = listQuery.data?.meta ?? null
  const page = listQuery.data?.page ?? 1
  const unreadCount = items.filter((item) => !item.readAt).length
  const lastPage = meta?.lastPage ?? 1
  const total = meta?.total ?? items.length
  const hasMore = page < lastPage

  const refresh = useCallback(() => {
    setActionError(null)
    void queryClient.invalidateQueries({ queryKey: allKey })
  }, [allKey, queryClient])

  const loadMore = useCallback(async () => {
    if (!tenantOrganizationId || !hasMore || loadingMore || listQuery.isFetching) return
    const nextPage = page + 1
    setLoadingMore(true)
    setActionError(null)
    try {
      const res = await api.notifications.list({ page: nextPage, limit: PER_PAGE })
      const parsed = unwrapNotificationsPaginated(res.data)
      queryClient.setQueryData<NotificationsFeed>(feedKey, (old) => ({
        items: [...(old?.items ?? []), ...parsed.items],
        meta: parsed.meta,
        page: parsed.meta?.currentPage ?? nextPage,
      }))
    } catch (err) {
      setActionError((err as ApiError).message || t('loadFailed'))
    } finally {
      setLoadingMore(false)
    }
  }, [
    feedKey,
    hasMore,
    listQuery.isFetching,
    loadingMore,
    page,
    queryClient,
    t,
    tenantOrganizationId,
  ])

  const goToPage = useCallback(
    async (nextPage: number) => {
      if (!tenantOrganizationId || nextPage < 1 || nextPage > lastPage) return
      setActionError(null)
      try {
        const res = await api.notifications.list({ page: nextPage, limit: PER_PAGE })
        const parsed = unwrapNotificationsPaginated(res.data)
        queryClient.setQueryData<NotificationsFeed>(feedKey, {
          items: parsed.items,
          meta: parsed.meta,
          page: parsed.meta?.currentPage ?? nextPage,
        })
      } catch (err) {
        setActionError((err as ApiError).message || t('loadFailed'))
      }
    },
    [feedKey, lastPage, queryClient, t, tenantOrganizationId]
  )

  const markAsReadMutation = useMutation({
    mutationFn: (notificationId: string) => api.notifications.markAsRead(notificationId),
    onMutate: async (notificationId) => {
      setActionError(null)
      await queryClient.cancelQueries({ queryKey: allKey })
      const previous = queryClient.getQueryData<NotificationsFeed>(feedKey)
      const optimisticReadAt = new Date().toISOString()
      queryClient.setQueryData<NotificationsFeed>(feedKey, (old) => {
        if (!old) return old
        return {
          ...old,
          items: old.items.map((item) =>
            item.id === notificationId ? { ...item, readAt: optimisticReadAt } : item
          ),
        }
      })
      return { previous }
    },
    onError: (err, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(feedKey, context.previous)
      }
      setActionError((err as unknown as ApiError).message || t('markReadFailed'))
    },
    onSuccess: (res) => {
      const updated = unwrapNotification(res.data)
      if (!updated) return
      queryClient.setQueryData<NotificationsFeed>(feedKey, (old) => {
        if (!old) return old
        return {
          ...old,
          items: old.items.map((entry) => (entry.id === updated.id ? updated : entry)),
        }
      })
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: allKey })
    },
  })

  const markAllAsReadMutation = useMutation({
    mutationFn: () => api.notifications.markAllAsRead(),
    onMutate: async () => {
      setActionError(null)
      await queryClient.cancelQueries({ queryKey: allKey })
      const previous = queryClient.getQueryData<NotificationsFeed>(feedKey)
      const readAt = new Date().toISOString()
      queryClient.setQueryData<NotificationsFeed>(feedKey, (old) => {
        if (!old) return old
        return {
          ...old,
          items: old.items.map((item) => (item.readAt ? item : { ...item, readAt })),
        }
      })
      return { previous }
    },
    onError: (err, _void, context) => {
      if (context?.previous) {
        queryClient.setQueryData(feedKey, context.previous)
      }
      setActionError((err as unknown as ApiError).message || t('markAllFailed'))
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: allKey })
    },
  })

  const markAsRead = useCallback(
    async (item: Notification) => {
      if (item.readAt || markAsReadMutation.isPending) return
      try {
        await markAsReadMutation.mutateAsync(item.id)
      } catch {
        // surfaced via actionError
      }
    },
    [markAsReadMutation]
  )

  const markAllAsRead = useCallback(async () => {
    if (markAllAsReadMutation.isPending || unreadCount === 0) return
    try {
      await markAllAsReadMutation.mutateAsync()
    } catch {
      // surfaced via actionError
    }
  }, [markAllAsReadMutation, unreadCount])

  const listError = listQuery.error
    ? (listQuery.error as unknown as ApiError).message || t('loadFailed')
    : null

  return {
    items,
    meta,
    page,
    lastPage,
    total,
    loading: listQuery.isLoading || (enabled && orgsLoading),
    loadingMore,
    markingAll: markAllAsReadMutation.isPending,
    markingId: markAsReadMutation.isPending ? (markAsReadMutation.variables ?? null) : null,
    error: listError || actionError,
    unreadCount,
    hasMore,
    refresh,
    loadMore: () => {
      void loadMore()
    },
    goToPage: (nextPage: number) => {
      void goToPage(nextPage)
    },
    markAllAsRead,
    markAsRead,
  }
}
