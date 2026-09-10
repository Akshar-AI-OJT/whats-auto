'use client'

import { useCallback, useId, useState, useSyncExternalStore } from 'react'
import { useTranslations } from 'next-intl'
import { Bot, Loader2, PanelRight, RotateCcw, UserRound, X } from 'lucide-react'
import { api, type ApiError, type InboxConversation, type OrganizationMember } from '@/lib/api'
import { cn } from '@/lib/utils'
import { hasPermission, PERMISSIONS } from '@/lib/rbac'
import { useOrganizations } from '@/components/dashboard/OrganizationsProvider'
import { Button } from '@/components/ui/button'
import { DashboardToast, useDashboardToast } from '@/components/dashboard/ui/use-dashboard-toast'
import { useInboxOrganization } from './InboxOrganizationContext'
import { unwrapSingle } from './inbox-utils'
import { conversationAiMode } from './inbox-ai-mode'

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

type InboxConversationActionsProps = {
  conversation: InboxConversation
  members: OrganizationMember[]
  onUpdated: (patch: Partial<InboxConversation>) => void
}

function mapActionError(apiError: ApiError, t: (key: string) => string): string {
  if (apiError.status === 401) return t('errors.sessionExpired')
  if (apiError.status === 403 || apiError.code === 'PERMISSION_DENIED') {
    return t('errors.permissionDenied')
  }
  if (apiError.code === 'E_CONVERSATION_NOT_FOUND') return t('errors.notFound')
  if (apiError.code === 'E_AGENT_NOT_FOUND') return t('errors.agentNotFound')
  if (apiError.code === 'E_CONVERSATION_AI_TRANSITION') return t('errors.invalidAiTransition')
  return apiError.message || t('errors.actionFailed')
}

const selectClassName = cn(
  'h-8 w-36 max-w-full cursor-pointer appearance-none rounded-lg border border-dash-border bg-canvas pl-8 pr-7 text-xs font-medium text-ink outline-none',
  'transition-[border-color,box-shadow]',
  'hover:border-dash-border-strong',
  'focus-visible:border-primary/55 focus-visible:ring-2 focus-visible:ring-primary/30',
  'disabled:cursor-not-allowed disabled:opacity-60'
)

const iconActionClassName = 'size-8 shrink-0 justify-center px-0'

export function InboxConversationActions({
  conversation,
  members,
  onUpdated,
}: InboxConversationActionsProps) {
  const t = useTranslations('dashboard.inbox.thread.actions')
  const tDetails = useTranslations('dashboard.inbox.details')
  const { permissions, isLoading: orgsLoading } = useOrganizations()
  const { detailsOpen, setDetailsOpen } = useInboxOrganization()
  const isXl = useSyncExternalStore(subscribeXl, getIsXl, () => false)
  const assignId = useId()
  const { toast, showToast, clearToast } = useDashboardToast()

  const [pendingAction, setPendingAction] = useState<
    'assign' | 'close' | 'reopen' | 'takeover' | 'resume' | null
  >(null)

  const canAssign = hasPermission(permissions, PERMISSIONS.INBOX_ASSIGN)
  const canClose = hasPermission(permissions, PERMISSIONS.INBOX_CLOSE)
  const canReply = hasPermission(permissions, PERMISSIONS.INBOX_REPLY)
  const isClosed = conversation.status === 'closed'
  const busy = pendingAction !== null || orgsLoading
  const aiMode = conversationAiMode(conversation)
  const orphanPause =
    aiMode === 'AI_AUTO' &&
    (conversation.automationBlocked === true ||
      conversation.openFlowSessionStatus === 'PAUSED_FOR_HUMAN')
  const showTakeover = canReply && (aiMode === 'AI_AUTO' || aiMode === 'HANDOVER') && !orphanPause
  const showResume = canReply && (aiMode === 'HANDOVER' || aiMode === 'HUMAN_ACTIVE' || orphanPause)

  const applyPatch = useCallback(
    (payload: unknown) => {
      const patch = unwrapSingle<InboxConversation>(payload)
      if (!patch) return
      onUpdated(patch)
    },
    [onUpdated]
  )

  const handleAssign = useCallback(
    async (assignedAgentId: string) => {
      if (!canAssign || !assignedAgentId || busy) return
      if (assignedAgentId === conversation.assignedAgentId) return

      setPendingAction('assign')
      clearToast()
      try {
        const res = await api.inbox.assignConversation(conversation.id, {
          assignedAgentId,
        })
        applyPatch(res.data)
      } catch (err) {
        showToast(mapActionError(err as ApiError, t), 'error')
      } finally {
        setPendingAction(null)
      }
    },
    [
      applyPatch,
      busy,
      canAssign,
      clearToast,
      conversation.assignedAgentId,
      conversation.id,
      showToast,
      t,
    ]
  )

  const handleClose = useCallback(async () => {
    if (!canClose || isClosed || busy) return
    if (!window.confirm(t('closeConfirm'))) return

    setPendingAction('close')
    clearToast()
    try {
      const res = await api.inbox.closeConversation(conversation.id)
      applyPatch(res.data)
    } catch (err) {
      showToast(mapActionError(err as ApiError, t), 'error')
    } finally {
      setPendingAction(null)
    }
  }, [applyPatch, busy, canClose, clearToast, conversation.id, isClosed, showToast, t])

  const handleReopen = useCallback(async () => {
    if (!canClose || !isClosed || busy) return

    setPendingAction('reopen')
    clearToast()
    try {
      const res = await api.inbox.reopenConversation(conversation.id)
      applyPatch(res.data)
    } catch (err) {
      showToast(mapActionError(err as ApiError, t), 'error')
    } finally {
      setPendingAction(null)
    }
  }, [applyPatch, busy, canClose, clearToast, conversation.id, isClosed, showToast, t])

  const handleTakeover = useCallback(async () => {
    if (!showTakeover || busy) return

    setPendingAction('takeover')
    clearToast()
    try {
      const res = await api.inbox.takeoverAi(conversation.id)
      applyPatch(res.data)
    } catch (err) {
      showToast(mapActionError(err as ApiError, t), 'error')
    } finally {
      setPendingAction(null)
    }
  }, [applyPatch, busy, clearToast, conversation.id, showTakeover, showToast, t])

  const handleResume = useCallback(async () => {
    if (!showResume || busy) return

    setPendingAction('resume')
    clearToast()
    try {
      const res = await api.inbox.resumeAi(conversation.id)
      applyPatch(res.data)
    } catch (err) {
      showToast(mapActionError(err as ApiError, t), 'error')
    } finally {
      setPendingAction(null)
    }
  }, [applyPatch, busy, clearToast, conversation.id, showResume, showToast, t])

  if (!canAssign && !canClose && !canReply) return null

  // Docked details (xl+) shrinks the chat column — compact the header then.
  const dockedDetails = detailsOpen && isXl
  const showAssign = canAssign && !dockedDetails
  const showActionLabels = !dockedDetails

  return (
    <div className="relative flex shrink-0 items-center gap-1.5 bg-canvas/95 pl-1">
      {toast ? (
        <DashboardToast
          message={toast.message}
          variant={toast.variant}
          className="absolute top-full right-0 z-20 mt-2 w-[min(18rem,calc(100vw-2rem))]"
          onDismiss={clearToast}
        />
      ) : null}

      {showAssign ? (
        <div className="relative hidden min-w-0 lg:block">
          <label htmlFor={assignId} className="sr-only">
            {t('assignLabel')}
          </label>
          <UserRound
            className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-mute"
            aria-hidden
          />
          <select
            id={assignId}
            disabled={busy || members.length === 0}
            value={conversation.assignedAgentId ?? ''}
            onChange={(event) => {
              const value = event.target.value
              if (!value) return
              void handleAssign(value)
            }}
            className={selectClassName}
          >
            <option value="" disabled>
              {members.length === 0 ? t('noAgents') : t('assignPlaceholder')}
            </option>
            {members.map((member) => (
              <option key={member.userId} value={member.userId}>
                {member.name?.trim() || member.email}
              </option>
            ))}
          </select>
          {pendingAction === 'assign' ? (
            <Loader2
              className="pointer-events-none absolute top-1/2 right-2 size-3.5 -translate-y-1/2 animate-spin text-mute"
              aria-hidden
            />
          ) : null}
        </div>
      ) : null}

      <Button
        type="button"
        variant="outline"
        size="icon-sm"
        className="size-8 shrink-0"
        aria-label={detailsOpen ? tDetails('closePanel') : tDetails('openPanel')}
        aria-pressed={detailsOpen}
        onClick={() => setDetailsOpen(!detailsOpen)}
      >
        <PanelRight className="size-3.5" aria-hidden />
      </Button>

      {canClose && !isClosed ? (
        <Button
          type="button"
          variant="outline"
          size="xs"
          className={cn(
            iconActionClassName,
            showActionLabels && '2xl:h-8 2xl:w-auto 2xl:gap-1.5 2xl:px-3'
          )}
          disabled={busy}
          aria-label={t('close')}
          onClick={() => {
            void handleClose()
          }}
        >
          {pendingAction === 'close' ? (
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
          ) : (
            <X className="size-3.5" aria-hidden />
          )}
          {showActionLabels ? <span className="hidden 2xl:inline">{t('close')}</span> : null}
        </Button>
      ) : null}

      {canClose && isClosed ? (
        <Button
          type="button"
          variant="secondary"
          size="xs"
          className={cn(
            iconActionClassName,
            showActionLabels && '2xl:h-8 2xl:w-auto 2xl:gap-1.5 2xl:px-3'
          )}
          disabled={busy}
          aria-label={t('reopen')}
          onClick={() => {
            void handleReopen()
          }}
        >
          {pendingAction === 'reopen' ? (
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
          ) : (
            <RotateCcw className="size-3.5" aria-hidden />
          )}
          {showActionLabels ? <span className="hidden 2xl:inline">{t('reopen')}</span> : null}
        </Button>
      ) : null}

      {showTakeover ? (
        <Button
          type="button"
          variant="outline"
          size="xs"
          className={cn(
            iconActionClassName,
            showActionLabels && '2xl:h-8 2xl:w-auto 2xl:gap-1.5 2xl:px-3'
          )}
          disabled={busy}
          aria-label={t('takeover')}
          onClick={() => {
            void handleTakeover()
          }}
        >
          {pendingAction === 'takeover' ? (
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
          ) : (
            <UserRound className="size-3.5" aria-hidden />
          )}
          {showActionLabels ? <span className="hidden 2xl:inline">{t('takeover')}</span> : null}
        </Button>
      ) : null}

      {showResume ? (
        <Button
          type="button"
          variant="secondary"
          size="xs"
          className={cn(
            iconActionClassName,
            showActionLabels && '2xl:h-8 2xl:w-auto 2xl:gap-1.5 2xl:px-3'
          )}
          disabled={busy}
          aria-label={t('resume')}
          onClick={() => {
            void handleResume()
          }}
        >
          {pendingAction === 'resume' ? (
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
          ) : (
            <Bot className="size-3.5" aria-hidden />
          )}
          {showActionLabels ? <span className="hidden 2xl:inline">{t('resume')}</span> : null}
        </Button>
      ) : null}
    </div>
  )
}
