'use client'

import { useCallback, useId, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Bot, Loader2, RotateCcw, UserRound } from 'lucide-react'
import {
  api,
  type ApiError,
  type InboxConversation,
  type InboxConversationStatus,
  type OrganizationMember,
} from '@/lib/api'
import { cn } from '@/lib/utils'
import { hasPermission, PERMISSIONS } from '@/lib/rbac'
import { useOrganizations } from '@/components/dashboard/OrganizationsProvider'
import { Button } from '@/components/ui/button'
import {
  DashboardToast,
  useDashboardToast,
} from '@/components/dashboard/ui/use-dashboard-toast'
import { unwrapSingle } from './inbox-utils'
import { conversationAiMode } from './inbox-ai-mode'

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
  'h-9 w-full appearance-none rounded-lg border border-dash-border bg-canvas pl-8 pr-8 text-xs font-medium text-ink outline-none',
  'transition-[border-color,box-shadow]',
  'hover:border-dash-border-strong',
  'focus-visible:border-primary/55 focus-visible:ring-2 focus-visible:ring-primary/30',
  'disabled:cursor-not-allowed disabled:opacity-60'
)

export function InboxConversationActions({
  conversation,
  members,
  onUpdated,
}: InboxConversationActionsProps) {
  const t = useTranslations('dashboard.inbox.thread.actions')
  const tStatus = useTranslations('dashboard.inbox.filters.status')
  const { permissions, isLoading: orgsLoading } = useOrganizations()
  const assignId = useId()
  const statusId = useId()
  const { toast, showToast, clearToast } = useDashboardToast()

  const [pendingAction, setPendingAction] = useState<
    'assign' | 'status' | 'close' | 'reopen' | 'takeover' | 'resume' | null
  >(null)

  const canAssign = hasPermission(permissions, PERMISSIONS.INBOX_ASSIGN)
  const canClose = hasPermission(permissions, PERMISSIONS.INBOX_CLOSE)
  const canUpdateStatus = hasPermission(permissions, PERMISSIONS.INBOX_VIEW)
  const canReply = hasPermission(permissions, PERMISSIONS.INBOX_REPLY)
  const isClosed = conversation.status === 'closed'
  const busy = pendingAction !== null || orgsLoading
  const aiMode = conversationAiMode(conversation)
  const showTakeover = canReply && (aiMode === 'AI_AUTO' || aiMode === 'HANDOVER')
  const showResume = canReply && (aiMode === 'HANDOVER' || aiMode === 'HUMAN_ACTIVE')
  const activeStatus: 'open' | 'pending' =
    conversation.status === 'pending' ? 'pending' : 'open'

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

  const handleStatusChange = useCallback(
    async (status: Extract<InboxConversationStatus, 'open' | 'pending'>) => {
      if (!canUpdateStatus || isClosed || busy) return
      if (status === conversation.status) return

      setPendingAction('status')
      clearToast()
      try {
        const res = await api.inbox.updateConversation(conversation.id, { status })
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
      canUpdateStatus,
      clearToast,
      conversation.id,
      conversation.status,
      isClosed,
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
  }, [
    applyPatch,
    busy,
    canClose,
    clearToast,
    conversation.id,
    isClosed,
    showToast,
    t,
  ])

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
  }, [
    applyPatch,
    busy,
    canClose,
    clearToast,
    conversation.id,
    isClosed,
    showToast,
    t,
  ])

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

  if (!canAssign && !canClose && !canUpdateStatus && !canReply) return null

  return (
    <div className="flex w-full flex-col gap-2 sm:w-auto sm:items-end">
      {toast ? (
        <DashboardToast
          message={toast.message}
          variant={toast.variant}
          className="w-full sm:max-w-xs"
          onDismiss={clearToast}
        />
      ) : null}

      <div className="flex flex-wrap items-center gap-2 sm:justify-end">
        {canUpdateStatus && !isClosed ? (
          <div className="relative min-w-[7.5rem] flex-1 sm:flex-none">
            <label htmlFor={statusId} className="sr-only">
              {t('statusLabel')}
            </label>
            <select
              id={statusId}
              disabled={busy}
              value={activeStatus}
              onChange={(event) => {
                const value = event.target.value as 'open' | 'pending'
                void handleStatusChange(value)
              }}
              className={cn(selectClassName, 'pl-3')}
            >
              <option value="open">{tStatus('open')}</option>
              <option value="pending">{tStatus('pending')}</option>
            </select>
            {pendingAction === 'status' ? (
              <Loader2
                className="pointer-events-none absolute top-1/2 right-2 size-3.5 -translate-y-1/2 animate-spin text-mute"
                aria-hidden
              />
            ) : null}
          </div>
        ) : null}

        {canAssign ? (
          <div className="relative min-w-[10.5rem] flex-1 sm:flex-none">
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

        {canClose && !isClosed ? (
          <Button
            type="button"
            variant="outline"
            size="xs"
            disabled={busy}
            onClick={() => {
              void handleClose()
            }}
          >
            {pendingAction === 'close' ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
            ) : null}
            {t('close')}
          </Button>
        ) : null}

        {canClose && isClosed ? (
          <Button
            type="button"
            variant="secondary"
            size="xs"
            className="gap-1.5"
            disabled={busy}
            onClick={() => {
              void handleReopen()
            }}
          >
            {pendingAction === 'reopen' ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
            ) : (
              <RotateCcw className="size-3.5" aria-hidden />
            )}
            {t('reopen')}
          </Button>
        ) : null}

        {showTakeover ? (
          <Button
            type="button"
            variant="outline"
            size="xs"
            className="gap-1.5"
            disabled={busy}
            onClick={() => {
              void handleTakeover()
            }}
          >
            {pendingAction === 'takeover' ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
            ) : (
              <UserRound className="size-3.5" aria-hidden />
            )}
            {t('takeover')}
          </Button>
        ) : null}

        {showResume ? (
          <Button
            type="button"
            variant="secondary"
            size="xs"
            className="gap-1.5"
            disabled={busy}
            onClick={() => {
              void handleResume()
            }}
          >
            {pendingAction === 'resume' ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
            ) : (
              <Bot className="size-3.5" aria-hidden />
            )}
            {t('resume')}
          </Button>
        ) : null}
      </div>
    </div>
  )
}
