'use client'

import { useCallback, useId, useState } from 'react'
import { useTranslations } from 'next-intl'
import { FileImage, FileText, Loader2, Paperclip, Send, X } from 'lucide-react'
import { api, type ApiError, type InboxMessage, type MediaAsset } from '@/lib/api'
import { cn } from '@/lib/utils'
import { hasPermission, PERMISSIONS } from '@/lib/rbac'
import { useOrganizations } from '@/components/dashboard/OrganizationsProvider'
import { Button } from '@/components/ui/button'
import {
  DashboardToast,
  useDashboardToast,
} from '@/components/dashboard/ui/use-dashboard-toast'
import { MediaPicker } from '@/components/dashboard/templates/MediaPicker'
import { unwrapSingle } from './inbox-utils'

type InboxReplyComposerProps = {
  conversationId: string
  conversationStatus: string
  onSent: (message?: InboxMessage | null) => Promise<void> | void
}

function mapSendError(apiError: ApiError, t: (key: string) => string): string {
  if (apiError.status === 401) return t('errors.sessionExpired')
  if (apiError.status === 403 || apiError.code === 'PERMISSION_DENIED') {
    return t('errors.permissionDenied')
  }
  if (apiError.code === 'E_CONVERSATION_CLOSED' || apiError.code === 'E_OUTBOUND_CONVERSATION_CLOSED') {
    return t('errors.conversationClosed')
  }
  if (apiError.code === 'E_CONVERSATION_NOT_FOUND') return t('errors.notFound')
  if (apiError.code === 'E_OUTBOUND_SESSION_WINDOW_EXPIRED') return t('errors.sessionWindow')
  return apiError.message || t('errors.sendFailed')
}

export function InboxReplyComposer({
  conversationId,
  conversationStatus,
  onSent,
}: InboxReplyComposerProps) {
  const t = useTranslations('dashboard.inbox.thread.composer')
  const { permissions, isLoading: orgsLoading } = useOrganizations()
  const textareaId = useId()
  const { toast, showToast, clearToast } = useDashboardToast()

  const [draft, setDraft] = useState('')
  const [attachment, setAttachment] = useState<MediaAsset | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [sending, setSending] = useState(false)

  const canReply = hasPermission(permissions, PERMISSIONS.INBOX_REPLY)
  const canAttach = hasPermission(permissions, PERMISSIONS.MEDIA_VIEW)
  const isClosed = conversationStatus === 'closed'
  const trimmed = draft.trim()
  const canSend =
    canReply &&
    !isClosed &&
    !sending &&
    !orgsLoading &&
    (trimmed.length > 0 || Boolean(attachment))

  const handleSend = useCallback(async () => {
    if (!canSend) return

    const idempotencyKey = crypto.randomUUID()

    setSending(true)
    clearToast()
    try {
      let sent: InboxMessage | null = null
      if (attachment) {
        const res = await api.inbox.sendMessage(
          conversationId,
          {
            contentType: attachment.kind === 'image' ? 'image' : 'document',
            mediaAssetId: attachment.id,
            contentText: trimmed || undefined,
          },
          idempotencyKey
        )
        sent = unwrapSingle<InboxMessage>(res.data)
      } else {
        const res = await api.inbox.sendMessage(
          conversationId,
          {
            contentType: 'text',
            contentText: trimmed,
          },
          idempotencyKey
        )
        sent = unwrapSingle<InboxMessage>(res.data)
      }
      setDraft('')
      setAttachment(null)
      await onSent(sent)
    } catch (err) {
      showToast(mapSendError(err as ApiError, t), 'error')
    } finally {
      setSending(false)
    }
  }, [attachment, canSend, clearToast, conversationId, onSent, showToast, t, trimmed])

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== 'Enter' || event.shiftKey) return
    event.preventDefault()
    void handleSend()
  }

  if (!canReply) {
    return (
      <div className="shrink-0 border-t border-dash-border bg-dash-surface/40 px-4 py-3 sm:px-5">
        <p className="text-center text-sm text-mute">{t('readOnly')}</p>
      </div>
    )
  }

  if (isClosed) {
    return (
      <div className="shrink-0 border-t border-dash-border bg-dash-surface/40 px-4 py-3 sm:px-5">
        <p className="text-center text-sm text-mute">{t('closedHint')}</p>
      </div>
    )
  }

  return (
    <div className="shrink-0 border-t border-dash-border bg-canvas px-4 py-3 sm:px-5">
      {toast ? (
        <DashboardToast
          message={toast.message}
          variant={toast.variant}
          className="mb-2.5"
          onDismiss={clearToast}
        />
      ) : null}

      {attachment ? (
        <div className="mb-2 flex items-center gap-2 rounded-lg border border-dash-border bg-dash-surface/60 px-3 py-2 text-sm">
          <span className="flex size-7 items-center justify-center rounded-md bg-dash-surface text-mute">
            {attachment.kind === 'image' ? (
              <FileImage className="size-3.5" />
            ) : (
              <FileText className="size-3.5" />
            )}
          </span>
          <span className="min-w-0 flex-1 truncate text-ink">{attachment.fileName}</span>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-7"
            aria-label={t('clearAttachment')}
            disabled={sending}
            onClick={() => setAttachment(null)}
          >
            <X className="size-3.5" />
          </Button>
        </div>
      ) : null}

      <div className="flex items-end gap-2">
        {canAttach ? (
          <Button
            type="button"
            size="icon"
            variant="outline"
            className="size-10 shrink-0 rounded-xl"
            aria-label={t('attach')}
            disabled={sending}
            onClick={() => setPickerOpen(true)}
          >
            <Paperclip className="size-4" />
          </Button>
        ) : null}

        <div className="min-w-0 flex-1">
          <label htmlFor={textareaId} className="sr-only">
            {t('label')}
          </label>
          <textarea
            id={textareaId}
            rows={2}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={attachment ? t('captionPlaceholder') : t('placeholder')}
            disabled={sending}
            className={cn(
              'max-h-32 min-h-[4.5rem] w-full resize-none rounded-xl border border-dash-border bg-dash-surface/80 px-3 py-2.5',
              'text-sm leading-5 text-ink outline-none transition-[border-color,box-shadow]',
              'placeholder:text-mute',
              'hover:border-dash-border-strong',
              'focus-visible:border-primary/55 focus-visible:ring-2 focus-visible:ring-primary/30',
              'disabled:cursor-not-allowed disabled:opacity-60'
            )}
          />
          <p className="mt-1.5 text-[11px] text-mute">{t('hint')}</p>
        </div>

        <Button
          type="button"
          size="icon"
          className="size-10 shrink-0 rounded-xl"
          disabled={!canSend}
          aria-label={t('send')}
          onClick={() => {
            void handleSend()
          }}
        >
          {sending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <Send className="size-4" aria-hidden />
          )}
        </Button>
      </div>

      <MediaPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onSelect={(asset) => setAttachment(asset)}
      />
    </div>
  )
}
