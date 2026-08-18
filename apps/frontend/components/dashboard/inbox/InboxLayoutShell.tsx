'use client'

import { useSelectedLayoutSegments } from 'next/navigation'
import { InboxConversationListSidebar } from './InboxConversationListSidebar'
import {
  InboxConversationDetails,
  InboxDetailsEmpty,
} from './InboxConversationDetails'
import { InboxSelectConversation } from './InboxSelectConversation'
import { InboxWorkspaceProvider, useInboxWorkspace } from './InboxWorkspaceContext'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useTranslations } from 'next-intl'

type InboxLayoutShellProps = {
  children: React.ReactNode
}

function InboxLayoutShellInner({ children }: InboxLayoutShellProps) {
  const segments = useSelectedLayoutSegments()
  const conversationId = segments[0] ?? null
  const isThread = Boolean(conversationId)
  const { detailsOpen, setDetailsOpen } = useInboxWorkspace()
  const t = useTranslations('dashboard.inbox.details')

  return (
    <>
      {/* Mobile / small tablet: list on index, thread on conversation */}
      <div className="lg:hidden">
        {!isThread ? (
          <div className="flex w-full min-w-0 flex-col gap-4">
            <InboxConversationListSidebar variant="page" />
          </div>
        ) : (
          children
        )}
      </div>

      {/* Desktop: persistent 3-pane workspace */}
      <div className="hidden lg:flex lg:h-[calc(100dvh-7.5rem)] lg:min-h-0 lg:gap-0">
        <InboxConversationListSidebar
          selectedConversationId={conversationId ?? undefined}
          variant="panel"
        />
        <div className="min-h-0 min-w-0 flex-1 px-0 lg:pl-0">
          <div className="flex h-full min-h-0 flex-col lg:pl-4">
            {isThread ? children : <InboxSelectConversation />}
          </div>
        </div>
        <div className="hidden min-h-0 w-[19rem] shrink-0 pl-4 xl:flex xl:w-[22rem]">
          {isThread && conversationId ? (
            <InboxConversationDetails conversationId={conversationId} />
          ) : (
            <InboxDetailsEmpty />
          )}
        </div>
      </div>

      {/* Tablet / desktop < xl: details drawer */}
      {isThread && conversationId ? (
        <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
          <DialogContent
            className="max-h-[min(92vh,52rem)] gap-0 overflow-hidden p-0 sm:max-w-md xl:hidden"
            showCloseButton
          >
            <DialogHeader className="sr-only">
              <DialogTitle>{t('title')}</DialogTitle>
            </DialogHeader>
            <div className="h-[min(85vh,48rem)]">
              <InboxConversationDetails
                conversationId={conversationId}
                className="rounded-none border-0 shadow-none"
                onClosePanel={() => setDetailsOpen(false)}
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
    <InboxWorkspaceProvider>
      <InboxLayoutShellInner>{children}</InboxLayoutShellInner>
    </InboxWorkspaceProvider>
  )
}
