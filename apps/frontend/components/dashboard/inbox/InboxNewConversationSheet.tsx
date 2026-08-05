'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Loader2, Plus, Phone } from 'lucide-react'
import type { ApiError, ContactSummary, InboxConversation, WhatsappConfigSummary } from '@/lib/api'
import { api } from '@/lib/api'
import { hasPermission, PERMISSIONS } from '@/lib/rbac'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { WorkspaceAvatar } from '@/components/dashboard/WorkspaceSwitcher'
import {
  DashboardToast,
  useDashboardToast,
} from '@/components/dashboard/ui/use-dashboard-toast'
import { useOrganizations } from '@/components/dashboard/OrganizationsProvider'
import { unwrapPaginated, unwrapSingle } from './inbox-utils'

function unwrapList<T>(payload: { data?: T[] } | T[] | null | undefined): T[] {
  if (!payload) return []
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload.data)) return payload.data
  return unwrapPaginated<T>(payload).items
}

function contactDisplayLabel(contact: ContactSummary) {
  return contact.name?.trim() || contact.phone || contact.id
}

function contactInitialsFromContact(contact: ContactSummary) {
  const source = contact.name?.trim() || contact.phone || contact.id
  const parts = source.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) {
    return `${parts[0]![0] ?? ''}${parts[1]![0] ?? ''}`.toUpperCase()
  }
  return source.slice(0, 2).toUpperCase() || '?'
}

type TranslationFn = (key: string) => string

function mapCreateError(apiError: ApiError, t: TranslationFn) {
  if (apiError.status === 401) return t('errors.sessionExpired')
  if (apiError.status === 403 || apiError.code === 'PERMISSION_DENIED') {
    return t('errors.permissionDenied')
  }
  return apiError.message || t('errors.createFailed')
}

type InboxNewConversationSheetProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (conversationId: string) => void
}

export function InboxNewConversationSheet({
  open,
  onOpenChange,
  onCreated,
}: InboxNewConversationSheetProps) {
  const t = useTranslations('dashboard.inbox.newConversation')
  const { tenantOrganizationId, canViewInbox, canViewContacts, permissions } = useOrganizations()

  const canViewWhatsapp = hasPermission(permissions, PERMISSIONS.WHATSAPP_VIEW)

  const mountedRef = useRef(false)
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const { toast, showToast, clearToast } = useDashboardToast()

  const [contacts, setContacts] = useState<ContactSummary[]>([])
  const [whatsappConfigs, setWhatsappConfigs] = useState<WhatsappConfigSummary[]>([])
  const [contactsLoading, setContactsLoading] = useState(false)
  const [configsLoading, setConfigsLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [contactQuery, setContactQuery] = useState('')
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null)
  const [selectedWhatsappConfigId, setSelectedWhatsappConfigId] = useState<string | null>(null)

  const [submitting, setSubmitting] = useState(false)

  const canCreate =
    canViewInbox &&
    canViewContacts &&
    canViewWhatsapp &&
    Boolean(selectedContactId && selectedWhatsappConfigId) &&
    !submitting &&
    !contactsLoading &&
    !configsLoading

  const filteredContacts = useMemo(() => {
    const q = contactQuery.trim().toLowerCase()
    if (!q) return contacts
    return contacts.filter((c) => {
      const label = contactDisplayLabel(c).toLowerCase()
      const phone = c.phone?.toLowerCase() ?? ''
      return label.includes(q) || phone.includes(q)
    })
  }, [contacts, contactQuery])

  const reset = useCallback(() => {
    setContacts([])
    setWhatsappConfigs([])
    setContactsLoading(false)
    setConfigsLoading(false)
    setLoadError(null)
    setContactQuery('')
    setSelectedContactId(null)
    setSelectedWhatsappConfigId(null)
    setSubmitting(false)
    clearToast()
  }, [clearToast])

  const load = useCallback(async () => {
    if (!tenantOrganizationId) return

    reset()
    clearToast()

    if (!canViewInbox || !canViewContacts || !canViewWhatsapp) {
      setLoadError(t('errors.permissionDenied'))
      return
    }

    setContactsLoading(true)
    setConfigsLoading(true)

    try {
      const [{ data: contactsData }, { data: configsData }] = await Promise.all([
        api.contacts.list(),
        api.whatsapp.listConfigs(),
      ])

      if (!mountedRef.current) return

      const normalizedContacts = unwrapList<ContactSummary>(contactsData)
      const rows = normalizedContacts.filter((c) => c.organizationId === tenantOrganizationId)
      setContacts(rows)

      const normalizedConfigs = unwrapList<WhatsappConfigSummary>(configsData)
      setWhatsappConfigs(normalizedConfigs)
      if (normalizedConfigs[0]) {
        setSelectedWhatsappConfigId(normalizedConfigs[0].id)
      }
    } catch (err) {
      if (!mountedRef.current) return
      setLoadError((err as ApiError).message || t('errors.loadFailed'))
    } finally {
      if (!mountedRef.current) return
      setContactsLoading(false)
      setConfigsLoading(false)
    }
  }, [
    tenantOrganizationId,
    reset,
    clearToast,
    canViewInbox,
    canViewContacts,
    canViewWhatsapp,
    t,
  ])

  // Defer fetch so setState is not synchronous inside the effect body.
  useEffect(() => {
    if (!open) return
    const handle = window.setTimeout(() => {
      void load()
    }, 0)
    return () => window.clearTimeout(handle)
  }, [open, load])

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      onOpenChange(nextOpen)
      if (!nextOpen) reset()
    },
    [onOpenChange, reset]
  )

  const selectDisabled = Boolean(contactsLoading || configsLoading || loadError)

  const handleSubmit = useCallback(async () => {
    if (!selectedContactId || !selectedWhatsappConfigId) return
    if (!tenantOrganizationId) return
    if (!canCreate) return

    setSubmitting(true)
    clearToast()
    try {
      const created = await api.inbox.createConversation({
        contactId: selectedContactId,
        whatsappConfigId: selectedWhatsappConfigId,
      })

      const payload =
        unwrapSingle<InboxConversation>(created.data) ??
        (created.data as InboxConversation | undefined)
      const conversationId = payload?.id

      if (!conversationId) {
        throw new Error('Missing conversation id')
      }

      onCreated(conversationId)
      onOpenChange(false)
      reset()
    } catch (err) {
      showToast(mapCreateError(err as ApiError, t), 'error')
    } finally {
      setSubmitting(false)
    }
  }, [
    canCreate,
    clearToast,
    onCreated,
    onOpenChange,
    reset,
    selectedContactId,
    selectedWhatsappConfigId,
    showToast,
    t,
    tenantOrganizationId,
  ])

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-xl"
        showCloseButton={false}
      >
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <span className="inline-flex size-10 items-center justify-center rounded-xl bg-primary-pale text-positive-deep">
              <Plus className="size-4" aria-hidden />
            </span>
            {t('title')}
          </SheetTitle>
          <SheetDescription>{t('description')}</SheetDescription>
        </SheetHeader>

        {toast ? (
          <div className="mb-2">
            <DashboardToast
              message={toast.message}
              variant={toast.variant}
              onDismiss={clearToast}
            />
          </div>
        ) : null}

        {loadError ? (
          <div role="alert" className="rounded-xl border border-negative/25 bg-negative/5 px-4 py-3 text-sm text-negative">
            {loadError}
          </div>
        ) : null}

        <div className="flex min-h-0 flex-col gap-4">
          <div className="flex min-h-0 flex-col gap-2">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-ink">{t('contactLabel')}</p>
              <p className="text-xs text-mute">
                {contactsLoading ? t('loadingContacts') : `${filteredContacts.length}`}
              </p>
            </div>

            <div className="relative">
              <Input
                type="search"
                value={contactQuery}
                onChange={(e) => setContactQuery(e.target.value)}
                placeholder={t('contactSearchPlaceholder')}
                disabled={selectDisabled}
                className="pl-10"
              />
              <Phone className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-mute" aria-hidden />
            </div>

            <div className="min-h-0 flex-1 overflow-auto rounded-2xl border border-dash-border bg-canvas/50">
              {contactsLoading ? (
                <div className="flex items-center justify-center gap-2 px-4 py-8 text-sm text-body">
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                  {t('loadingContacts')}
                </div>
              ) : filteredContacts.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-mute">{t('emptyContacts')}</div>
              ) : (
                <ul className="divide-y divide-dash-border">
                  {filteredContacts.map((contact) => {
                    const selected = contact.id === selectedContactId
                    return (
                      <li key={contact.id}>
                        <button
                          type="button"
                          disabled={selectDisabled}
                          className={cn(
                            'flex w-full items-center gap-3 px-4 py-3 text-left transition-colors',
                            selected ? 'bg-primary-pale/70' : 'hover:bg-primary-pale/20'
                          )}
                          onClick={() => setSelectedContactId(contact.id)}
                        >
                          <WorkspaceAvatar
                            initials={contactInitialsFromContact(contact)}
                            size="md"
                            className="rounded-lg"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-ink">
                              {contactDisplayLabel(contact)}
                            </p>
                            <p className="truncate text-xs text-mute">
                              {contact.phone}
                            </p>
                          </div>
                          {selected ? (
                            <span className="shrink-0 rounded-md bg-primary px-2 py-0.5 text-[11px] font-bold text-on-primary">
                              Selected
                            </span>
                          ) : null}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <p className="text-sm font-semibold text-ink">{t('whatsappLabel')}</p>
            <select
              disabled={selectDisabled || whatsappConfigs.length === 0}
              value={selectedWhatsappConfigId ?? ''}
              onChange={(e) => setSelectedWhatsappConfigId(e.target.value)}
              className={cn(
                'h-11 w-full rounded-xl border border-dash-border bg-canvas px-3 text-sm text-ink outline-none',
                'transition-[border-color,box-shadow] duration-200',
                'hover:border-dash-border-strong',
                'focus-visible:border-primary/55 focus-visible:ring-2 focus-visible:ring-primary/30',
                'disabled:cursor-not-allowed disabled:opacity-60'
              )}
            >
              {whatsappConfigs.length === 0 ? (
                <option value="">{t('emptyWhatsappConfigs')}</option>
              ) : (
                whatsappConfigs.map((cfg) => (
                  <option key={cfg.id} value={cfg.id}>
                    {cfg.displayPhoneNumber || cfg.phoneNumberId}
                  </option>
                ))
              )}
            </select>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-2 sm:mt-auto">
          <Button
            type="button"
            disabled={!canCreate}
            onClick={() => void handleSubmit()}
            className="w-full gap-2"
          >
            {submitting ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Plus className="size-4" aria-hidden />
            )}
            {t('createCta')}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}

