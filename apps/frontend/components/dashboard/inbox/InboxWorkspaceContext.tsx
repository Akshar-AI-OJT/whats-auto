'use client'

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { InboxConversation, OrganizationMember } from '@/lib/api'
import { mergeConversationUpdate } from './inbox-utils'

type InboxWorkspaceContextValue = {
  conversationId: string | null
  conversation: InboxConversation | null
  members: OrganizationMember[]
  setConversationId: (id: string | null) => void
  setConversation: (conversation: InboxConversation | null) => void
  setMembers: (members: OrganizationMember[]) => void
  mergeConversation: (patch: Partial<InboxConversation>) => void
  detailsOpen: boolean
  setDetailsOpen: (open: boolean) => void
}

const InboxWorkspaceContext = createContext<InboxWorkspaceContextValue | null>(null)

export function InboxWorkspaceProvider({ children }: { children: ReactNode }) {
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [conversation, setConversation] = useState<InboxConversation | null>(null)
  const [members, setMembers] = useState<OrganizationMember[]>([])
  const [detailsOpen, setDetailsOpen] = useState(false)

  const mergeConversation = useCallback((patch: Partial<InboxConversation>) => {
    setConversation((prev) => (prev ? mergeConversationUpdate(prev, patch) : prev))
  }, [])

  const value = useMemo(
    () => ({
      conversationId,
      conversation,
      members,
      setConversationId,
      setConversation,
      setMembers,
      mergeConversation,
      detailsOpen,
      setDetailsOpen,
    }),
    [conversationId, conversation, members, mergeConversation, detailsOpen]
  )

  return (
    <InboxWorkspaceContext.Provider value={value}>{children}</InboxWorkspaceContext.Provider>
  )
}

export function useInboxWorkspace() {
  const ctx = useContext(InboxWorkspaceContext)
  if (!ctx) {
    throw new Error('useInboxWorkspace must be used within InboxWorkspaceProvider')
  }
  return ctx
}
