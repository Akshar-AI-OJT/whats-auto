'use client'

import { useCallback, useSyncExternalStore } from 'react'
import { useSelectedLayoutSegments } from 'next/navigation'
import { InboxConversationListSidebar } from './InboxConversationListSidebar'
import { InboxConversationDetails } from './InboxConversationDetails'
import { InboxSelectConversation } from './InboxSelectConversation'
import { InboxOrganizationProvider, useInboxOrganization } from './InboxOrganizationContext'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'

/** Tailwind `xl` — docked details only at this breakpoint and above. */
const XL_MQ = '(min-width: 1280px)'

function subscribeXl(onStoreChange: () => void) {
  if (typeof window === 'undefined') return () => {}
  const media = window.matchMedia(XL_MQ)
  media.addEventListener('change', onStoreChange)
  return () => media.removeEventListener('change', onStoreChange)
}

function getIsXl() {
  if (typeof window === 'undefined') return false
  return window.matchMedia(XL_MQ).matches
}

type InboxLayoutShellProps = {
  children: React.ReactNode
}

function InboxLayoutShellInner({ children }: InboxLayoutShellProps) {
  const segments = useSelectedLayoutSegments()
  const conversationId = segments[0] ?? null
  const isThread = Boolean(conversationId)
  const { detailsOpen, setDetailsOpen } = useInboxOrganization()
  const t = useTranslations('dashboard.inbox.details')
  const isXl = useSyncExternalStore(subscribeXl, getIsXl, () => false)

  const closeDetails = useCallback(() => {
    setDetailsOpen(false)
  }, [setDetailsOpen])

  const showDockedDetails = isXl && detailsOpen && isThread && Boolean(conversationId)
  const showDetailsDialog = !isXl && detailsOpen && isThread && Boolean(conversationId)

  return (
    <>
      {/*
        Fill the content viewport and cancel #app-scroll-root bottom padding so
        the page itself does not scroll — only list/thread panes scroll.
      */}
      <div
        className={cn(
          'flex min-h-0 flex-col overflow-hidden',
          'h-[calc(100dvh-7.25rem)]',
          '-mb-[max(6rem,calc(2rem+env(safe-area-inset-bottom,0px)))]',
          'pb-4'
        )}
      >
        {/* Mobile / small tablet: list on index, thread on conversation */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:hidden">
          {!isThread ? (
            <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
              <InboxConversationListSidebar variant="page" />
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
          )}
        </div>

        {/* Desktop: list + chat; optional docked details from xl when open */}
        <div className="hidden min-h-0 flex-1 gap-0 overflow-hidden lg:flex">
          <InboxConversationListSidebar
            selectedConversationId={conversationId ?? undefined}
            variant="panel"
          />
          <div className="min-h-0 min-w-0 flex-1 overflow-hidden px-0 lg:pl-0">
            <div className="flex h-full min-h-0 flex-col overflow-hidden lg:pl-4">
              {isThread ? children : <InboxSelectConversation />}
            </div>
          </div>
          {showDockedDetails && conversationId ? (
            <div className="hidden min-h-0 w-76 shrink-0 overflow-hidden pl-4 xl:flex xl:w-88">
              <InboxConversationDetails
                conversationId={conversationId}
                onClosePanel={closeDetails}
              />
            </div>
          ) : null}
        </div>
      </div>

      {/* Below xl: details as Dialog overlay (avoids focus trap on xl docked path) */}
      {showDetailsDialog && conversationId ? (
        <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
          <DialogContent
            className="max-h-[min(92vh,52rem)] gap-0 overflow-hidden p-0 sm:max-w-md"
            showCloseButton
          >
            <DialogHeader className="sr-only">
              <DialogTitle>{t('title')}</DialogTitle>
            </DialogHeader>
            <div className="h-[min(85vh,48rem)]">
              <InboxConversationDetails
                conversationId={conversationId}
                className="rounded-none border-0 shadow-none"
                onClosePanel={closeDetails}
              />
            </div>
          </DialogContent>
        </Dialog>
      ) : null}
    </>
  )
}

export function InboxLayoutShell({ children }: InboxLayoutShellProps) {
  return (
    <InboxOrganizationProvider>
      <InboxLayoutShellInner>{children}</InboxLayoutShellInner>
    </InboxOrganizationProvider>
  )
}
