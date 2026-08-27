'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { InboxConversation, OrganizationMember } from '@/lib/api'
import type { InboxSseClientEvent } from '@/lib/inbox-sse'
import { useInboxEventSource } from '@/hooks/useInboxEventSource'
import { useOrganizations } from '@/components/dashboard/OrganizationsProvider'
import { queryKeys } from '@/lib/query-keys'
import { mergeConversationUpdate } from './inbox-utils'

export type InboxSseHandler = (event: InboxSseClientEvent) => void

const SOFT_CATCHUP_MS = 90_000

type InboxWorkspaceContextValue = {
  conversationId: string | null
  conversation: InboxConversation | null
  members: OrganizationMember[]
  setConversationId: (id: string | null) => void
  setConversation: (conversation: InboxConversation | null) => void
  setMembers: (members: OrganizationMember[]) => void
  mergeConversation: (patch: Partial<InboxConversation>) => void
  subscribeInboxEvents: (handler: InboxSseHandler) => () => void
  detailsOpen: boolean
  setDetailsOpen: (open: boolean) => void
}

const InboxWorkspaceContext = createContext<InboxWorkspaceContextValue | null>(null)

export function InboxWorkspaceProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const { tenantOrganizationId, canViewInbox, isResolvingAccess } = useOrganizations()
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [conversation, setConversation] = useState<InboxConversation | null>(null)
  const [members, setMembers] = useState<OrganizationMember[]>([])
  const [detailsOpen, setDetailsOpen] = useState(false)
  const handlersRef = useRef(new Set<InboxSseHandler>())

  const sseEnabled = Boolean(canViewInbox && tenantOrganizationId && !isResolvingAccess)

  const mergeConversation = useCallback((patch: Partial<InboxConversation>) => {
    setConversation((prev) => (prev ? mergeConversationUpdate(prev, patch) : prev))
  }, [])

  const subscribeInboxEvents = useCallback((handler: InboxSseHandler) => {
    handlersRef.current.add(handler)
    return () => {
      handlersRef.current.delete(handler)
    }
  }, [])

  const dispatchInboxEvent = useCallback((event: InboxSseClientEvent) => {
    for (const handler of handlersRef.current) {
      handler(event)
    }
  }, [])

  const catchUpInboxQueries = useCallback(() => {
    if (!tenantOrganizationId) return
    void queryClient.invalidateQueries({
      queryKey: queryKeys.inbox.all(tenantOrganizationId),
    })
  }, [queryClient, tenantOrganizationId])

  useInboxEventSource({
    enabled: sseEnabled,
    reconnectKey: tenantOrganizationId,
    onEvent: dispatchInboxEvent,
    onConnected: catchUpInboxQueries,
    onVisible: catchUpInboxQueries,
  })

  // Soft catch-up while the inbox is open and the tab is visible.
  useEffect(() => {
    if (!sseEnabled || !tenantOrganizationId) return
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        catchUpInboxQueries()
      }
    }, SOFT_CATCHUP_MS)
    return () => window.clearInterval(timer)
  }, [catchUpInboxQueries, sseEnabled, tenantOrganizationId])

  const value = useMemo(
    () => ({
      conversationId,
      conversation,
      members,
      setConversationId,
      setConversation,
      setMembers,
      mergeConversation,
      subscribeInboxEvents,
      detailsOpen,
      setDetailsOpen,
    }),
    [conversationId, conversation, members, mergeConversation, subscribeInboxEvents, detailsOpen]
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
