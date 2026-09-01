'use client'

import { useId, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { Loader2, StickyNote } from 'lucide-react'
import { api, type ApiError, type InboxConversationNote } from '@/lib/api'
import { queryKeys } from '@/lib/query-keys'
import { cn } from '@/lib/utils'
import { hasPermission, PERMISSIONS } from '@/lib/rbac'
import { useOrganizations } from '@/components/dashboard/OrganizationsProvider'
import { Button } from '@/components/ui/button'
import { DashboardToast, useDashboardToast } from '@/components/dashboard/ui/use-dashboard-toast'
import { formatMessageTime, unwrapList, unwrapSingle } from './inbox-utils'

type InboxThreadNotesProps = {
  conversationId: string
  active: boolean
}

function mapNoteError(apiError: ApiError, t: (key: string) => string): string {
  if (apiError.status === 401) return t('errors.sessionExpired')
  if (apiError.status === 403 || apiError.code === 'PERMISSION_DENIED') {
    return t('errors.permissionDenied')
  }
  if (apiError.code === 'E_CONVERSATION_NOT_FOUND') return t('errors.notFound')
  return apiError.message || t('errors.saveFailed')
}

export function InboxThreadNotes({ conversationId, active }: InboxThreadNotesProps) {
  const t = useTranslations('dashboard.inbox.thread.notes')
  const { tenantOrganizationId, permissions, isLoading: orgsLoading } = useOrganizations()
  const queryClient = useQueryClient()
  const textareaId = useId()
  const { toast, showToast, clearToast } = useDashboardToast()
  const [draft, setDraft] = useState('')

  const canCreate = hasPermission(permissions, PERMISSIONS.INBOX_REPLY)
  const trimmed = draft.trim()
  const notesKey = queryKeys.inbox.notes(tenantOrganizationId, conversationId)

  const notesQuery = useQuery({
    queryKey: notesKey,
    queryFn: async () => {
      const res = await api.inbox.listNotes(conversationId)
      return unwrapList<InboxConversationNote>(res.data)
    },
    enabled: active && !orgsLoading && Boolean(tenantOrganizationId) && Boolean(conversationId),
    staleTime: 30_000,
  })

  const createMutation = useMutation({
    mutationFn: (noteText: string) => api.inbox.createNote(conversationId, { noteText }),
    onSuccess: (res) => {
      const created = unwrapSingle<InboxConversationNote>(res.data)
      if (created) {
        queryClient.setQueryData<InboxConversationNote[]>(notesKey, (old) => [
          ...(old ?? []),
          created,
        ])
      } else {
        void queryClient.invalidateQueries({ queryKey: notesKey })
      }
      setDraft('')
    },
    onError: (err) => {
      showToast(mapNoteError(err as unknown as ApiError, t), 'error')
    },
  })

  const notes = notesQuery.data ?? []
  const loading = notesQuery.isLoading
  const saving = createMutation.isPending
  const canSave = canCreate && trimmed.length > 0 && !saving && !orgsLoading

  if (!active) return null

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5 sm:py-5">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-body">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            {t('loading')}
          </div>
        ) : notes.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 px-4 py-12 text-center">
            <span className="flex size-10 items-center justify-center rounded-xl bg-dash-surface text-mute">
              <StickyNote className="size-5" aria-hidden />
            </span>
            <p className="text-sm font-semibold text-ink">{t('emptyTitle')}</p>
            <p className="max-w-sm text-sm leading-5 text-mute">{t('emptyDescription')}</p>
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {notes.map((note) => {
              const author =
                note.createdBy.name?.trim() || note.createdBy.email?.trim() || t('unknownAuthor')
              return (
                <li
                  key={note.id}
                  className="rounded-2xl border border-dash-border bg-dash-surface/60 px-3.5 py-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-[11px] font-semibold tracking-wide text-mute uppercase">
                      {author}
                    </p>
                    <time className="shrink-0 text-[11px] tabular-nums text-mute">
                      {formatMessageTime(note.createdAt)}
                    </time>
                  </div>
                  <p className="mt-1.5 text-sm leading-5 whitespace-pre-wrap text-ink break-words">
                    {note.noteText}
                  </p>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <div className="shrink-0 border-t border-dash-border bg-canvas px-4 py-3 sm:px-5">
        {toast ? (
          <DashboardToast
            message={toast.message}
            variant={toast.variant}
            className="mb-2.5"
            onDismiss={clearToast}
          />
        ) : null}

        {!canCreate ? (
          <p className="text-center text-sm text-mute">{t('readOnly')}</p>
        ) : (
          <div className="flex items-end gap-2">
            <div className="min-w-0 flex-1">
              <label htmlFor={textareaId} className="sr-only">
                {t('label')}
              </label>
              <textarea
                id={textareaId}
                rows={2}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder={t('placeholder')}
                disabled={saving}
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
              size="sm"
              className="shrink-0"
              disabled={!canSave}
              onClick={() => {
                clearToast()
                createMutation.mutate(trimmed)
              }}
            >
              {saving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              {t('save')}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
