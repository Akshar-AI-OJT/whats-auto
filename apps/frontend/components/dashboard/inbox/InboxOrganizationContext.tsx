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

type InboxOrganizationContextValue = {
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

const InboxOrganizationContext = createContext<InboxOrganizationContextValue | null>(null)

export function InboxOrganizationProvider({ children }: { children: ReactNode }) {
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

  const lastVisibilityCatchUpRef = useRef(0)

  const catchUpInboxQueries = useCallback(
    (options?: { force?: boolean }) => {
      if (!tenantOrganizationId) return
      const force = options?.force === true
      const now = Date.now()
      // Tab focus used to invalidate on every visibilitychange — that refetched the
      // whole inbox. Soft catch-up at most once per soft interval unless forced
      // (SSE reconnect), so cached conversations stay on screen.
      if (!force && now - lastVisibilityCatchUpRef.current < SOFT_CATCHUP_MS) return
      lastVisibilityCatchUpRef.current = now
      void queryClient.refetchQueries({
        queryKey: queryKeys.inbox.all(tenantOrganizationId),
        type: 'active',
      })
    },
    [queryClient, tenantOrganizationId]
  )

  useInboxEventSource({
    enabled: sseEnabled,
    reconnectKey: tenantOrganizationId,
    onEvent: dispatchInboxEvent,
    onConnected: () => catchUpInboxQueries({ force: true }),
    onVisible: () => catchUpInboxQueries(),
  })

  // Soft catch-up while the inbox is open and the tab is visible.
  useEffect(() => {
    if (!sseEnabled || !tenantOrganizationId) return
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        catchUpInboxQueries({ force: true })
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
    <InboxOrganizationContext.Provider value={value}>{children}</InboxOrganizationContext.Provider>
  )
}

export function useInboxOrganization() {
  const ctx = useContext(InboxOrganizationContext)
  if (!ctx) {
    throw new Error('useInboxOrganization must be used within InboxOrganizationProvider')
  }
  return ctx
}
