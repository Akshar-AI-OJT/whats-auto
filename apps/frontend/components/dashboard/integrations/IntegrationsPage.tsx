'use client'

import { useCallback, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { Check, Copy, KeyRound, Loader2, Plug, PlugZap, RefreshCw, Unplug } from 'lucide-react'
import { getBaseUrl } from '@/lib/api-base'
import {
  api,
  type ApiError,
  type IntegrationApiKey,
  type IntegrationConnection,
} from '@/lib/api'
import { queryKeys } from '@/lib/query-keys'
import { hasPermission, PERMISSIONS } from '@/lib/rbac'
import { cn } from '@/lib/utils'
import { useOrganizations } from '@/components/dashboard/OrganizationsProvider'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { DashboardPanel } from '@/components/dashboard/ui/DashboardPanel'
import {
  DashboardToast,
  useDashboardToast,
} from '@/components/dashboard/ui/use-dashboard-toast'
import { unwrapList, unwrapSingle } from '@/components/dashboard/inbox/inbox-utils'

const SHOPENUP_PROVIDER = 'shopenup'
const DEFAULT_DISPLAY_NAME = 'Shopenup'
const DEFAULT_KEY_NAME = 'Shopenup'
const SHOPENUP_EVENTS_PATH = '/api/v1/integrations/shopenup/events'

function formatTimestamp(value: string | null | undefined) {
  if (!value) return null
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value))
  } catch {
    return value
  }
}

function shopenupWebhookUrl() {
  const configured = getBaseUrl().replace(/\/$/, '')
  return `${configured}${SHOPENUP_EVENTS_PATH}`
}

function absoluteUrl(url: string) {
  if (/^https?:\/\//i.test(url)) return url
  return `${window.location.origin}${url}`
}

function mapIntegrationsError(apiError: ApiError, t: (key: string) => string) {
  if (apiError.status === 401) return t('errors.sessionExpired')
  if (apiError.status === 403 || apiError.code === 'PERMISSION_DENIED') {
    return t('errors.permissionDenied')
  }
  return apiError.message || t('errors.generic')
}

async function copyText(value: string) {
  await navigator.clipboard.writeText(value)
}

function StatusBadge({ status, label }: { status: string; label: string }) {
  const tone =
    status === 'connected'
      ? 'bg-primary-pale text-positive-deep ring-primary/25'
      : status === 'error'
        ? 'bg-negative/10 text-negative ring-negative/25'
        : 'bg-mute/10 text-mute ring-dash-border'

  return (
    <span className={cn('inline-flex rounded-md px-2 py-0.5 text-xs font-semibold ring-1', tone)}>
      {label}
    </span>
  )
}

type IntegrationsData = {
  connection: IntegrationConnection | null
  keys: IntegrationApiKey[]
}

export function IntegrationsPage() {
  const t = useTranslations('dashboard.integrations')
  const queryClient = useQueryClient()
  const {
    tenantOrganizationId,
    permissions,
    isLoading: orgsLoading,
  } = useOrganizations()

  const canView = hasPermission(permissions, PERMISSIONS.INTEGRATIONS_VIEW)
  const canManage = hasPermission(permissions, PERMISSIONS.INTEGRATIONS_MANAGE)

  const { toast, showToast, clearToast } = useDashboardToast()

  const [connecting, setConnecting] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [revokingId, setRevokingId] = useState<string | null>(null)
  const [copied, setCopied] = useState<'webhook' | 'secret' | null>(null)
  const [revealedSecret, setRevealedSecret] = useState<string | null>(null)
  const webhookUrl = shopenupWebhookUrl()

  const integrationsKey = queryKeys.integrations.all(tenantOrganizationId)

  const integrationsQuery = useQuery({
    queryKey: integrationsKey,
    queryFn: async (): Promise<IntegrationsData> => {
      const [connectionsRes, keysRes] = await Promise.all([
        api.integrations.list(),
        api.apiKeys.list(),
      ])
      const connections = unwrapList<IntegrationConnection>(connectionsRes.data)
      const listedKeys = unwrapList<IntegrationApiKey>(keysRes.data)
      return {
        connection: connections.find((item) => item.provider === SHOPENUP_PROVIDER) ?? null,
        keys: listedKeys
          .filter((key) => !key.revokedAt)
          .map((key) => {
            const listed = { ...key }
            delete listed.secretToken
            return listed
          }),
      }
    },
    enabled: !orgsLoading && Boolean(tenantOrganizationId) && canView,
    staleTime: 60_000,
  })

  const connection = integrationsQuery.data?.connection ?? null
  const keys = integrationsQuery.data?.keys ?? []
  const loading = integrationsQuery.isLoading || integrationsQuery.isFetching
  const listError = integrationsQuery.error
    ? mapIntegrationsError(integrationsQuery.error as unknown as ApiError, t)
    : null

  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: integrationsKey })
  }, [integrationsKey, queryClient])

  const patchData = useCallback(
    (updater: (prev: IntegrationsData) => IntegrationsData) => {
      queryClient.setQueryData<IntegrationsData>(integrationsKey, (old) =>
        updater(old ?? { connection: null, keys: [] })
      )
    },
    [integrationsKey, queryClient]
  )

  const connected = Boolean(connection)
  const status = connection?.status ?? 'disconnected'
  const statusLabel =
    status === 'connected'
      ? t('status.connected')
      : status === 'error'
        ? t('status.error')
        : t('status.disconnected')

  const handleConnect = useCallback(async () => {
    if (!canManage || connecting) return
    setConnecting(true)
    clearToast()
    try {
      const { data } = await api.integrations.upsert(SHOPENUP_PROVIDER, {
        displayName: DEFAULT_DISPLAY_NAME,
      })
      const next = unwrapSingle<IntegrationConnection>(data)
      patchData((prev) => ({ ...prev, connection: next }))
      showToast(t('toasts.connected'), 'success')
    } catch (err) {
      showToast(mapIntegrationsError(err as ApiError, t))
    } finally {
      setConnecting(false)
    }
  }, [canManage, connecting, clearToast, patchData, showToast, t])

  const handleDisconnect = useCallback(async () => {
    if (!canManage || disconnecting) return
    setDisconnecting(true)
    clearToast()
    try {
      await api.integrations.destroy(SHOPENUP_PROVIDER)
      patchData((prev) => ({ ...prev, connection: null }))
      showToast(t('toasts.disconnected'), 'success')
    } catch (err) {
      showToast(mapIntegrationsError(err as ApiError, t))
    } finally {
      setDisconnecting(false)
    }
  }, [canManage, disconnecting, clearToast, patchData, showToast, t])

  const handleGenerate = useCallback(async () => {
    if (!canManage || generating) return
    setGenerating(true)
    clearToast()
    try {
      const { data } = await api.apiKeys.create({ name: DEFAULT_KEY_NAME })
      const created = unwrapSingle<IntegrationApiKey>(data)
      const secret = created?.secretToken
      if (!secret) {
        showToast(t('errors.secretMissing'))
        await refresh()
        return
      }
      setRevealedSecret(secret)
      showToast(t('toasts.keyCreated'), 'success')
      await refresh()
    } catch (err) {
      showToast(mapIntegrationsError(err as ApiError, t))
    } finally {
      setGenerating(false)
    }
  }, [canManage, generating, clearToast, showToast, t, refresh])

  const handleRevoke = useCallback(
    async (id: string) => {
      if (!canManage || revokingId) return
      setRevokingId(id)
      clearToast()
      try {
        await api.apiKeys.revoke(id)
        patchData((prev) => ({
          ...prev,
          keys: prev.keys.filter((key) => key.id !== id),
        }))
        showToast(t('toasts.keyRevoked'), 'success')
      } catch (err) {
        showToast(mapIntegrationsError(err as ApiError, t))
      } finally {
        setRevokingId(null)
      }
    },
    [canManage, revokingId, clearToast, patchData, showToast, t]
  )

  const handleCopy = useCallback(
    async (value: string, target: 'webhook' | 'secret') => {
      try {
        await copyText(target === 'webhook' ? absoluteUrl(value) : value)
        setCopied(target)
        showToast(
          target === 'webhook' ? t('toasts.webhookCopied') : t('toasts.secretCopied'),
          'success'
        )
        window.setTimeout(() => setCopied(null), 2000)
      } catch {
        showToast(t('errors.clipboard'))
      }
    },
    [showToast, t]
  )

  if (!orgsLoading && !canView) {
    return (
      <DashboardPanel className="px-4 py-5 sm:px-6">
        <p role="alert" className="text-sm text-negative">
          {t('errors.permissionDenied')}
        </p>
      </DashboardPanel>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-5 sm:gap-6">
      <DashboardPanel className="relative overflow-hidden px-4 py-5 sm:px-6 sm:py-6">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-14 right-0 size-40 rounded-full bg-primary-pale/70 blur-[60px]"
        />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-3.5">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary-pale text-positive-deep shadow-[0_4px_12px_rgb(159_232_112/0.2)]">
              <Plug className="size-5" aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-semibold tracking-wide text-positive-deep uppercase">
                {t('eyebrow')}
              </p>
              <h1 className="mt-1 font-display text-2xl tracking-tight text-ink sm:text-3xl">
                {t('title')}
              </h1>
              <p className="mt-1.5 max-w-2xl text-sm leading-6 text-body">{t('subtitle')}</p>
            </div>
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-2"
            disabled={loading || orgsLoading}
            onClick={() => void refresh()}
          >
            <RefreshCw className={cn('size-3.5', loading && 'animate-spin')} aria-hidden />
            {t('refresh')}
          </Button>
        </div>
      </DashboardPanel>

      {toast ? (
        <DashboardToast
          message={toast.message}
          variant={toast.variant}
          onDismiss={clearToast}
        />
      ) : null}

      <DashboardPanel className="px-4 py-5 sm:px-6">
        {listError ? (
          <p role="alert" className="mb-4 text-sm text-negative">
            {listError}
          </p>
        ) : null}

        {integrationsQuery.isLoading || orgsLoading ? (
          <div className="flex items-center gap-2 text-sm text-body">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            {t('loading')}
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex min-w-0 items-start gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-pale text-positive-deep">
                  <Plug className="size-4" aria-hidden />
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-display text-lg font-semibold tracking-tight text-ink">
                      {t('shopenupTitle')}
                    </h2>
                    <StatusBadge status={connected ? status : 'disconnected'} label={statusLabel} />
                  </div>
                  <p className="mt-0.5 text-sm text-mute">{t('shopenupDescription')}</p>
                  {connection?.lastErrorMessage ? (
                    <p role="alert" className="mt-1 text-xs text-negative">
                      {connection.lastErrorMessage}
                    </p>
                  ) : null}
                </div>
              </div>

              {canManage ? (
                connected ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    disabled={disconnecting}
                    onClick={() => void handleDisconnect()}
                  >
                    {disconnecting ? (
                      <Loader2 className="size-3.5 animate-spin" aria-hidden />
                    ) : (
                      <Unplug className="size-3.5" aria-hidden />
                    )}
                    {t('disconnect')}
                  </Button>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    className="gap-2"
                    disabled={connecting}
                    onClick={() => void handleConnect()}
                  >
                    {connecting ? (
                      <Loader2 className="size-3.5 animate-spin" aria-hidden />
                    ) : (
                      <PlugZap className="size-3.5" aria-hidden />
                    )}
                    {t('connectCta')}
                  </Button>
                )
              ) : null}
            </div>

            <div>
              <p className="text-sm font-semibold text-ink">{t('webhookLabel')}</p>
              <p className="mt-0.5 text-xs text-mute">{t('webhookHint')}</p>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                <Input
                  readOnly
                  value={webhookUrl}
                  className="h-10 font-mono text-xs"
                  onFocus={(event) => event.currentTarget.select()}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-2 sm:shrink-0"
                  onClick={() => void handleCopy(webhookUrl, 'webhook')}
                >
                  {copied === 'webhook' ? (
                    <Check className="size-3.5" aria-hidden />
                  ) : (
                    <Copy className="size-3.5" aria-hidden />
                  )}
                  {copied === 'webhook' ? t('copied') : t('copyWebhook')}
                </Button>
              </div>
            </div>

            <div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h3 className="font-display text-base font-semibold tracking-tight text-ink">
                    {t('keysTitle')}
                  </h3>
                  <p className="mt-0.5 text-sm text-mute">{t('keysDescription')}</p>
                </div>
                {canManage ? (
                  <Button
                    type="button"
                    size="sm"
                    className="gap-2"
                    disabled={generating}
                    onClick={() => void handleGenerate()}
                  >
                    {generating ? (
                      <Loader2 className="size-3.5 animate-spin" aria-hidden />
                    ) : (
                      <KeyRound className="size-3.5" aria-hidden />
                    )}
                    {t('generateCta')}
                  </Button>
                ) : null}
              </div>

              {keys.length === 0 ? (
                <div className="mt-4 flex flex-col items-center rounded-2xl border border-dash-border bg-dash-surface/50 px-5 py-10 text-center">
                  <span className="flex size-12 items-center justify-center rounded-2xl bg-primary-pale text-positive-deep">
                    <KeyRound className="size-5" aria-hidden />
                  </span>
                  <p className="mt-3 text-sm font-semibold text-ink">{t('noKeysTitle')}</p>
                  <p className="mt-1 max-w-md text-sm leading-5 text-mute">
                    {t('noKeysDescription')}
                  </p>
                </div>
              ) : (
                <ul className="mt-4 divide-y divide-dash-border overflow-hidden rounded-2xl border border-dash-border">
                  {keys.map((key) => {
                    const lastUsed = formatTimestamp(key.lastUsedAt)
                    const busy = revokingId === key.id
                    return (
                      <li key={key.id} className="bg-canvas/80 px-4 py-4 sm:px-5">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-ink">{key.name}</p>
                            <p className="mt-0.5 font-mono text-xs text-mute">
                              {t('prefix', { prefix: key.keyPrefix })}
                            </p>
                            <p className="mt-1 text-xs text-body">
                              {lastUsed
                                ? t('lastUsed', { date: lastUsed })
                                : t('neverUsed')}
                            </p>
                          </div>
                          {canManage ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="xs"
                              disabled={busy}
                              onClick={() => void handleRevoke(key.id)}
                            >
                              {busy ? (
                                <Loader2 className="size-3.5 animate-spin" aria-hidden />
                              ) : null}
                              {t('revoke')}
                            </Button>
                          ) : null}
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </div>
        )}
      </DashboardPanel>

      <Dialog
        open={Boolean(revealedSecret)}
        onOpenChange={(open) => {
          if (!open) {
            setRevealedSecret(null)
            setCopied((current) => (current === 'secret' ? null : current))
          }
        }}
      >
        <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-md">
          <DialogHeader className="border-b border-dash-border px-5 py-4 text-left sm:px-6">
            <DialogTitle>{t('secretTitle')}</DialogTitle>
            <DialogDescription>{t('secretDescription')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 px-5 py-4 sm:px-6">
            <p className="text-sm font-medium text-ink">{t('secretLabel')}</p>
            <Input
              readOnly
              value={revealedSecret ?? ''}
              className="h-10 font-mono text-xs"
              onFocus={(event) => event.currentTarget.select()}
            />
          </div>
          <DialogFooter className="border-t border-dash-border sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              className="gap-2"
              disabled={!revealedSecret}
              onClick={() => {
                if (revealedSecret) void handleCopy(revealedSecret, 'secret')
              }}
            >
              {copied === 'secret' ? (
                <Check className="size-3.5" aria-hidden />
              ) : (
                <Copy className="size-3.5" aria-hidden />
              )}
              {copied === 'secret' ? t('copied') : t('copySecret')}
            </Button>
            <Button type="button" onClick={() => setRevealedSecret(null)}>
              {t('secretDone')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
