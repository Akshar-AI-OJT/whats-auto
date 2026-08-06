'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Loader2, Plus, Phone } from 'lucide-react'
import { FaWhatsapp } from 'react-icons/fa'
import type { ApiError, ContactSummary, InboxConversation, WhatsappConfigSummary } from '@/lib/api'
import { api } from '@/lib/api'
import { hasPermission, PERMISSIONS } from '@/lib/rbac'
import { cn } from '@/lib/utils'
import { Link } from '@/i18n/navigation'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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

function configPhoneLabel(config: WhatsappConfigSummary) {
  return config.displayPhoneNumber?.trim() || config.phoneNumberId
}

function configNameLabel(config: WhatsappConfigSummary) {
  if (config.displayPhoneNumber?.trim() && config.displayPhoneNumber !== config.phoneNumberId) {
    return config.phoneNumberId
  }
  return config.wabaId ? `WABA ${config.wabaId}` : null
}

type TranslationFn = (key: string) => string

function mapCreateError(apiError: ApiError, t: TranslationFn) {
  if (apiError.status === 401) return t('errors.sessionExpired')
  if (apiError.status === 403 || apiError.code === 'PERMISSION_DENIED') {
    return t('errors.permissionDenied')
  }
  return apiError.message || t('errors.createFailed')
}

function WhatsappConfigSkeleton() {
  return (
    <div className="animate-pulse rounded-xl border border-dash-border bg-dash-surface/50 px-3.5 py-3">
      <div className="flex items-center gap-3">
        <div className="size-9 rounded-lg bg-dash-border" />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="h-3.5 w-36 rounded bg-dash-border" />
          <div className="h-3 w-24 rounded bg-dash-border" />
        </div>
        <div className="h-5 w-16 rounded-md bg-dash-border" />
      </div>
    </div>
  )
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
  const [whatsappQuery, setWhatsappQuery] = useState('')
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null)
  const [selectedWhatsappConfigId, setSelectedWhatsappConfigId] = useState<string | null>(null)

  const [submitting, setSubmitting] = useState(false)

  const connectedConfigs = useMemo(
    () => whatsappConfigs.filter((cfg) => cfg.status === 'connected'),
    [whatsappConfigs]
  )

  const hasConnectedWhatsapp = connectedConfigs.length > 0
  const missingWhatsapp = !configsLoading && !hasConnectedWhatsapp

  const filteredContacts = useMemo(() => {
    const q = contactQuery.trim().toLowerCase()
    if (!q) return contacts
    return contacts.filter((c) => {
      const label = contactDisplayLabel(c).toLowerCase()
      const phone = c.phone?.toLowerCase() ?? ''
      return label.includes(q) || phone.includes(q)
    })
  }, [contacts, contactQuery])

  const filteredWhatsappConfigs = useMemo(() => {
    const q = whatsappQuery.trim().toLowerCase()
    if (!q) return connectedConfigs
    return connectedConfigs.filter((cfg) => {
      const phone = configPhoneLabel(cfg).toLowerCase()
      const name = configNameLabel(cfg)?.toLowerCase() ?? ''
      const status = cfg.status.toLowerCase()
      return phone.includes(q) || name.includes(q) || status.includes(q)
    })
  }, [connectedConfigs, whatsappQuery])

  const canCreate =
    canViewInbox &&
    canViewContacts &&
    canViewWhatsapp &&
    hasConnectedWhatsapp &&
    Boolean(selectedContactId && selectedWhatsappConfigId) &&
    !submitting &&
    !contactsLoading &&
    !configsLoading

  const reset = useCallback(() => {
    setContacts([])
    setWhatsappConfigs([])
    setContactsLoading(false)
    setConfigsLoading(false)
    setLoadError(null)
    setContactQuery('')
    setWhatsappQuery('')
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

      const connected = normalizedConfigs.filter((cfg) => cfg.status === 'connected')
      if (connected.length === 1) {
        setSelectedWhatsappConfigId(connected[0]!.id)
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

  const statusLabel = (status: string) => {
    if (status === 'connected') return t('status.connected')
    if (status === 'disconnected') return t('status.disconnected')
    if (status === 'error') return t('status.error')
    return status
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="max-h-[min(88vh,40rem)] gap-0 overflow-hidden p-0 sm:max-w-lg"
        showCloseButton
      >
        <DialogHeader className="items-center border-b border-dash-border px-5 pt-6 pb-4 text-center sm:px-6">
          <span className="mb-3 inline-flex size-11 items-center justify-center rounded-xl bg-primary-pale text-positive-deep">
            <Plus className="size-4" aria-hidden />
          </span>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription className="max-w-sm text-center">
            {t('description')}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4 sm:px-6">
          {toast ? (
            <DashboardToast
              message={toast.message}
              variant={toast.variant}
              onDismiss={clearToast}
            />
          ) : null}

          {loadError ? (
            <div
              role="alert"
              className="rounded-xl border border-negative/25 bg-negative/5 px-4 py-3 text-center text-sm text-negative"
            >
              {loadError}
            </div>
          ) : null}

          <div className="flex flex-col gap-2">
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
              <Phone
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-mute"
                aria-hidden
              />
            </div>

            <div
              className={cn(
                'overflow-auto rounded-2xl border border-dash-border bg-canvas/50',
                missingWhatsapp ? 'max-h-40' : 'max-h-48'
              )}
            >
              {contactsLoading ? (
                <div className="flex items-center justify-center gap-2 px-4 py-6 text-sm text-body">
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                  {t('loadingContacts')}
                </div>
              ) : filteredContacts.length === 0 ? (
                <div className="px-4 py-6 text-center text-sm text-mute">
                  {t('emptyContacts')}
                </div>
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
                            'flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors',
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
                            <p className="truncate text-xs text-mute">{contact.phone}</p>
                          </div>
                          {selected ? (
                            <span className="shrink-0 rounded-md bg-primary px-2 py-0.5 text-[11px] font-bold text-on-primary">
                              {t('selected')}
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

            {configsLoading ? (
              <div className="space-y-2">
                <WhatsappConfigSkeleton />
              </div>
            ) : missingWhatsapp ? (
              <div className="flex flex-col items-center rounded-2xl border border-dash-border bg-dash-surface/50 px-5 py-6 text-center">
                <span className="flex size-11 items-center justify-center rounded-xl bg-primary-pale text-positive-deep">
                  <FaWhatsapp className="size-5" aria-hidden />
                </span>
                <p className="mt-3 text-sm font-semibold text-ink">
                  {t('emptyWhatsappTitle')}
                </p>
                <p className="mt-1 max-w-xs text-sm leading-5 text-mute">
                  {t('emptyWhatsappDescription')}
                </p>
                <Link
                  href="/dashboard/whatsapp"
                  onClick={() => onOpenChange(false)}
                  className={cn(buttonVariants({ size: 'sm' }), 'mt-4 gap-2')}
                >
                  <FaWhatsapp className="size-3.5" aria-hidden />
                  {t('connectWhatsappCta')}
                </Link>
              </div>
            ) : (
              <>
                {connectedConfigs.length > 3 ? (
                  <Input
                    type="search"
                    value={whatsappQuery}
                    onChange={(e) => setWhatsappQuery(e.target.value)}
                    placeholder={t('whatsappSearchPlaceholder')}
                    disabled={selectDisabled}
                  />
                ) : null}

                <ul className="divide-y divide-dash-border overflow-hidden rounded-2xl border border-dash-border bg-canvas/50">
                  {filteredWhatsappConfigs.length === 0 ? (
                    <li className="px-4 py-5 text-center text-sm text-mute">
                      {t('emptyWhatsappSearch')}
                    </li>
                  ) : (
                    filteredWhatsappConfigs.map((cfg) => {
                      const selected = cfg.id === selectedWhatsappConfigId
                      const secondary = configNameLabel(cfg)
                      return (
                        <li key={cfg.id}>
                          <button
                            type="button"
                            disabled={selectDisabled}
                            className={cn(
                              'flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition-colors',
                              selected ? 'bg-primary-pale/70' : 'hover:bg-primary-pale/20'
                            )}
                            onClick={() => setSelectedWhatsappConfigId(cfg.id)}
                          >
                            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary-pale text-positive-deep">
                              <FaWhatsapp className="size-4" aria-hidden />
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-semibold text-ink">
                                {configPhoneLabel(cfg)}
                              </p>
                              {secondary ? (
                                <p className="truncate text-xs text-mute">{secondary}</p>
                              ) : null}
                            </div>
                            <span
                              className={cn(
                                'shrink-0 rounded-md px-2 py-0.5 text-[11px] font-semibold ring-1',
                                cfg.status === 'connected'
                                  ? 'bg-primary-pale text-positive-deep ring-primary/25'
                                  : 'bg-mute/10 text-mute ring-dash-border'
                              )}
                            >
                              {statusLabel(cfg.status)}
                            </span>
                          </button>
                        </li>
                      )
                    })
                  )}
                </ul>
              </>
            )}
          </div>
        </div>

        <DialogFooter className="border-t border-dash-border">
          <div className="flex w-full flex-col gap-2">
            <Button
              type="button"
              disabled={!canCreate}
              title={missingWhatsapp ? t('createDisabledHint') : undefined}
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
            {missingWhatsapp ? (
              <p className="text-center text-xs leading-5 text-mute">
                {t('createDisabledHint')}
              </p>
            ) : null}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
