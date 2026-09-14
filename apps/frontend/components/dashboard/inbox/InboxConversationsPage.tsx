'use client'

/**
 * Index route content for desktop empty middle pane.
 * On mobile, the layout shell shows the conversation list instead.
 */
import { InboxSelectConversation } from './InboxSelectConversation'

export function InboxConversationsPage() {
  return (
    <div className="hidden h-full lg:block">
      <InboxSelectConversation />
    </div>
  )
}
