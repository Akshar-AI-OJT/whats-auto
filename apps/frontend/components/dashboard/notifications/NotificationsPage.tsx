'use client'

import { Bell } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { DashboardPanel } from '@/components/dashboard/ui/DashboardPanel'
import { DashboardSectionHeader } from '@/components/dashboard/ui/DashboardSectionHeader'
import { NotificationsList } from './NotificationsList'
import { useNotifications } from './useNotifications'

export function NotificationsPage() {
  const t = useTranslations('dashboard.notifications')
  const {
    items,
    page,
    lastPage,
    total,
    loading,
    loadingMore,
    markingAll,
    markingId,
    error,
    unreadCount,
    refresh,
    goToPage,
    markAllAsRead,
    markAsRead,
  } = useNotifications({ enabled: true })

  return (
    <div className="mx-auto flex w-full max-w-[960px] flex-col gap-6">
      <div className="space-y-1">
        <p className="text-xs font-semibold tracking-wide text-mute uppercase">
          {t('eyebrow')}
        </p>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">
          {t('title')}
        </h1>
        <p className="max-w-2xl text-sm leading-6 text-mute">{t('subtitle')}</p>
      </div>

      <DashboardPanel className="p-4 sm:p-5">
        <DashboardSectionHeader
          title={t('listTitle')}
          description={
            unreadCount > 0 ? t('unreadCount', { count: unreadCount }) : undefined
          }
          action={
            unreadCount > 0 ? (
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-primary-pale px-2.5 py-1 text-xs font-semibold text-positive-deep">
                <Bell className="size-3.5" aria-hidden />
                {t('unreadCount', { count: unreadCount })}
              </span>
            ) : undefined
          }
          className="mb-4"
        />
        <NotificationsList
          variant="page"
          items={items}
          loading={loading}
          loadingMore={loadingMore}
          error={error}
          markingId={markingId}
          unreadCount={unreadCount}
          markingAll={markingAll}
          page={page}
          lastPage={lastPage}
          total={total}
          onMarkAllAsRead={() => void markAllAsRead()}
          onMarkAsRead={(item) => void markAsRead(item)}
          onRetry={refresh}
          onGoToPage={goToPage}
        />
      </DashboardPanel>
    </div>
  )
}
