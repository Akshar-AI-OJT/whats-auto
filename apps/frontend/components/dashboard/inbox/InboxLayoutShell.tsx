'use client'

import { useSelectedLayoutSegments } from 'next/navigation'
import { InboxConversationListSidebar } from './InboxConversationListSidebar'

type InboxLayoutShellProps = {
  children: React.ReactNode
}

export function InboxLayoutShell({ children }: InboxLayoutShellProps) {
  const segments = useSelectedLayoutSegments()
  const conversationId = segments[0]
  const isThread = Boolean(conversationId)

  if (!isThread) {
    return <>{children}</>
  }

  return (
    <>
      <div className="lg:hidden">{children}</div>
      <div className="hidden lg:flex lg:h-[calc(100dvh-7.5rem)] lg:min-h-0">
        <InboxConversationListSidebar selectedConversationId={conversationId} />
        <div className="min-h-0 min-w-0 flex-1 pl-4">{children}</div>
      </div>
    </>
  )
}
