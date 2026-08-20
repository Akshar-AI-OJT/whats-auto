'use client'

import { useCallback, useId, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import {
  Loader2,
  Phone,
  PlugZap,
  RefreshCw,
  Send,
  Unplug,
} from 'lucide-react'
import { FaWhatsapp } from 'react-icons/fa'
import {
  api,
  type ApiError,
  type WhatsappEmbeddedSignupSession,
} from '@/lib/api'
import {
  loadFacebookSdk,
  parseEmbeddedSignupMessage,
  type EmbeddedSignupSessionInfo,
} from '@/lib/meta-fb-sdk'
import { hasPermission, PERMISSIONS } from '@/lib/rbac'
import { cn } from '@/lib/utils'
import { queryKeys } from '@/lib/query-keys'
import { useWhatsappConfigs } from '@/hooks/useWhatsappConfigs'
import { useOrganizations } from '@/components/dashboard/OrganizationsProvider'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DashboardPanel } from '@/components/dashboard/ui/DashboardPanel'
import {
  DashboardToast,
  useDashboardToast,
} from '@/components/dashboard/ui/use-dashboard-toast'
import { unwrapSingle } from '@/components/dashboard/inbox/inbox-utils'

function formatConnectedAt(value: string | null | undefined) {
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

function mapWhatsappError(apiError: ApiError, t: (key: string) => string) {
  if (apiError.status === 401) return t('errors.sessionExpired')
  if (apiError.status === 403 || apiError.code === 'PERMISSION_DENIED') {
    return t('errors.permissionDenied')
  }
  if (apiError.code === 'E_WA_PHONE_OWNED') return t('errors.phoneOwned')
  if (apiError.code === 'E_WA_NOT_CONNECTED') return t('errors.notConnected')
  if (apiError.code === 'E_WA_META_GRAPH') return apiError.message || t('errors.metaGraph')
  return apiError.message || t('errors.generic')
}

function StatusBadge({
  status,
  label,
}: {
  status: string
  label: string
}) {
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

export function WhatsappConnectionPage() {
  const t = useTranslations('dashboard.whatsapp')
  const queryClient = useQueryClient()
  const {
    tenantOrganizationId,
    permissions,
    isLoading: orgsLoading,
  } = useOrganizations()

  const canView = hasPermission(permissions, PERMISSIONS.WHATSAPP_VIEW)
  const canConnect = hasPermission(permissions, PERMISSIONS.WHATSAPP_CONNECT)
  const canManage = hasPermission(permissions, PERMISSIONS.WHATSAPP_MANAGE)

  const { toast, showToast, clearToast } = useDashboardToast()
  const testInputId = useId()

  const configsQuery = useWhatsappConfigs()
  const configs = configsQuery.data?.configs ?? []
  const loading = configsQuery.isFetching || orgsLoading
  const listError = configsQuery.error
    ? mapWhatsappError(configsQuery.error as unknown as ApiError, t)
    : null

  const [connecting, setConnecting] = useState(false)
  const [actionId, setActionId] = useState<string | null>(null)
  const [testToByConfig, setTestToByConfig] = useState<Record<string, string>>({})

  const sessionInfoRef = useRef<EmbeddedSignupSessionInfo | null>(null)

  const refreshConfigs = useCallback(async () => {
    await queryClient.invalidateQueries({
      queryKey: queryKeys.whatsapp.configs(tenantOrganizationId),
    })
  }, [queryClient, tenantOrganizationId])

  const handleConnect = useCallback(async () => {
    if (!canConnect || connecting) return

    setConnecting(true)
    clearToast()
    sessionInfoRef.current = null

    const onMessage = (event: MessageEvent) => {
      if (
        event.origin !== 'https://www.facebook.com' &&
        event.origin !== 'https://web.facebook.com'
      ) {
        return
      }
      const parsed = parseEmbeddedSignupMessage(event.data)
      if (!parsed) return
      if (parsed.event === 'FINISH' || parsed.event === 'FINISH_ONLY_WABA') {
        sessionInfoRef.current = parsed.data ?? null
      }
    }

    window.addEventListener('message', onMessage)

    try {
      const sessionRes = await api.whatsapp.getEmbeddedSignupSession()
      const session =
        unwrapSingle<WhatsappEmbeddedSignupSession>(sessionRes.data) ??
        (sessionRes.data as WhatsappEmbeddedSignupSession | undefined)

      if (!session?.appId || !session.configId || !session.graphVersion) {
        throw new Error(t('errors.sessionMissing'))
      }

      const FB = await loadFacebookSdk({
        appId: session.appId,
        graphVersion: session.graphVersion,
      })

      const code = await new Promise<string>((resolve, reject) => {
        FB.login(
          (response) => {
            const authCode = response.authResponse?.code
            if (authCode) {
              resolve(authCode)
              return
            }
            reject(new Error(t('errors.signupCancelled')))
          },
          {
            config_id: session.configId,
            response_type: 'code',
            override_default_response_type: true,
            extras: {
              setup: {},
              featureType: '',
              sessionInfoVersion: '3',
            },
          }
        )
      })

      // Meta posts session info around login completion; give the listener a beat.
      await new Promise((resolve) => window.setTimeout(resolve, 250))

      const info = sessionInfoRef.current as EmbeddedSignupSessionInfo | null
      const wabaId = info?.waba_id
      const phoneNumberId = info?.phone_number_id

      if (!wabaId || !phoneNumberId) {
        throw new Error(t('errors.sessionInfoMissing'))
      }

      await api.whatsapp.completeEmbeddedSignup({
        code,
        wabaId,
        phoneNumberId,
        businessId: info?.business_id,
      })

      showToast(t('toasts.connected'), 'success')
      await refreshConfigs()
    } catch (err) {
      const message =
        err && typeof err === 'object' && 'status' in err
          ? mapWhatsappError(err as ApiError, t)
          : err instanceof Error
            ? err.message
            : t('errors.generic')
      showToast(message, 'error')
    } finally {
      window.removeEventListener('message', onMessage)
      setConnecting(false)
    }
  }, [canConnect, clearToast, connecting, refreshConfigs, showToast, t])

  const handleDisconnect = useCallback(
    async (configId: string) => {
      if (!canConnect || actionId) return
      setActionId(configId)
      clearToast()
      try {
        await api.whatsapp.disconnectConfig(configId)
        showToast(t('toasts.disconnected'), 'success')
        await refreshConfigs()
      } catch (err) {
        showToast(mapWhatsappError(err as ApiError, t), 'error')
      } finally {
        setActionId(null)
      }
    },
    [actionId, canConnect, clearToast, refreshConfigs, showToast, t]
  )

  const handleTest = useCallback(
    async (configId: string) => {
      if (!canManage || actionId) return
      const to = testToByConfig[configId]?.trim()
      if (!to) {
        showToast(t('errors.testToRequired'), 'error')
        return
      }

      setActionId(configId)
      clearToast()
      try {
        await api.whatsapp.testConfig(configId, { to })
        showToast(t('toasts.testSent'), 'success')
      } catch (err) {
        showToast(mapWhatsappError(err as ApiError, t), 'error')
      } finally {
        setActionId(null)
      }
    },
    [actionId, canManage, clearToast, showToast, t, testToByConfig]
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
    <div className="flex w-full min-w-0 flex-col gap-5 sm:gap-6">
      <DashboardPanel className="relative overflow-hidden px-4 py-5 sm:px-6 sm:py-6">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-14 right-0 size-40 rounded-full bg-primary-pale/70 blur-[60px]"
        />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-3.5">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary-pale text-positive-deep shadow-[0_4px_12px_rgb(159_232_112/0.2)]">
              <FaWhatsapp className="size-5" aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-semibold tracking-wide text-positive-deep uppercase">
                {t('eyebrow')}
              </p>
              <h1 className="mt-1 font-display text-2xl tracking-tight text-ink sm:text-3xl">
                {t('title')}
              </h1>
              <p className="mt-1.5 max-w-2xl text-sm leading-6 text-body">
                {t('subtitle')}
              </p>
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-2"
              disabled={loading || orgsLoading}
              onClick={() => void refreshConfigs()}
            >
              <RefreshCw className={cn('size-3.5', loading && 'animate-spin')} aria-hidden />
              {t('refresh')}
            </Button>
            {canConnect ? (
              <Button
                type="button"
                size="sm"
                className="gap-2"
                disabled={connecting || orgsLoading}
                onClick={() => void handleConnect()}
              >
                {connecting ? (
                  <Loader2 className="size-3.5 animate-spin" aria-hidden />
                ) : (
                  <PlugZap className="size-3.5" aria-hidden />
                )}
                {t('connectCta')}
              </Button>
            ) : null}
          </div>
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
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-semibold tracking-tight text-ink">
              {t('listTitle')}
            </h2>
            <p className="mt-0.5 text-sm text-mute">{t('listDescription')}</p>
          </div>
        </div>

        {listError ? (
          <p role="alert" className="mt-4 text-sm text-negative">
            {listError}
          </p>
        ) : null}

        {loading || orgsLoading ? (
          <div className="mt-4 flex items-center gap-2 text-sm text-body">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            {t('loading')}
          </div>
        ) : configs.length === 0 ? (
          <div className="mt-4 flex flex-col items-center rounded-2xl border border-dash-border bg-dash-surface/50 px-5 py-10 text-center">
            <span className="flex size-12 items-center justify-center rounded-2xl bg-primary-pale text-positive-deep">
              <FaWhatsapp className="size-5" aria-hidden />
            </span>
            <p className="mt-3 text-sm font-semibold text-ink">{t('emptyTitle')}</p>
            <p className="mt-1 max-w-md text-sm leading-5 text-mute">
              {t('emptyDescription')}
            </p>
            {canConnect ? (
              <Button
                type="button"
                size="sm"
                className="mt-4 gap-2"
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
            ) : null}
          </div>
        ) : (
          <ul className="mt-4 divide-y divide-dash-border overflow-hidden rounded-2xl border border-dash-border">
            {configs.map((config) => {
              const busy = actionId === config.id
              const connectedAt = formatConnectedAt(config.connectedAt)
              const statusLabel =
                config.status === 'connected'
                  ? t('status.connected')
                  : config.status === 'error'
                    ? t('status.error')
                    : t('status.disconnected')

              return (
                <li key={config.id} className="bg-canvas/80 px-4 py-4 sm:px-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex min-w-0 items-start gap-3">
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-pale text-positive-deep">
                        <Phone className="size-4" aria-hidden />
                      </span>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate text-sm font-semibold text-ink">
                            {config.displayPhoneNumber?.trim() || config.phoneNumberId}
                          </p>
                          <StatusBadge status={config.status} label={statusLabel} />
                        </div>
                        <p className="mt-0.5 truncate text-xs text-mute">
                          {t('phoneNumberId', { id: config.phoneNumberId })}
                        </p>
                        {config.wabaId ? (
                          <p className="mt-0.5 truncate text-xs text-mute">
                            {t('wabaId', { id: config.wabaId })}
                          </p>
                        ) : null}
                        {connectedAt ? (
                          <p className="mt-1 text-xs text-body">
                            {t('connectedAt', { date: connectedAt })}
                          </p>
                        ) : null}
                      </div>
                    </div>

                    <div className="flex shrink-0 flex-wrap gap-2">
                      {canConnect ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="xs"
                          className="gap-1.5"
                          disabled={busy || connecting}
                          onClick={() => void handleDisconnect(config.id)}
                        >
                          {busy ? (
                            <Loader2 className="size-3.5 animate-spin" aria-hidden />
                          ) : (
                            <Unplug className="size-3.5" aria-hidden />
                          )}
                          {t('disconnect')}
                        </Button>
                      ) : null}
                    </div>
                  </div>

                  {canManage && config.status === 'connected' ? (
                    <div className="mt-3 flex flex-col gap-2 rounded-xl border border-dash-border bg-dash-surface/40 p-3 sm:flex-row sm:items-end">
                      <div className="min-w-0 flex-1">
                        <label
                          htmlFor={`${testInputId}-${config.id}`}
                          className="text-xs font-semibold text-mute"
                        >
                          {t('testLabel')}
                        </label>
                        <Input
                          id={`${testInputId}-${config.id}`}
                          value={testToByConfig[config.id] ?? ''}
                          onChange={(e) =>
                            setTestToByConfig((prev) => ({
                              ...prev,
                              [config.id]: e.target.value,
                            }))
                          }
                          placeholder={t('testPlaceholder')}
                          disabled={busy}
                          className="mt-1.5"
                        />
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        className="gap-2"
                        disabled={busy}
                        onClick={() => void handleTest(config.id)}
                      >
                        {busy ? (
                          <Loader2 className="size-3.5 animate-spin" aria-hidden />
                        ) : (
                          <Send className="size-3.5" aria-hidden />
                        )}
                        {t('testCta')}
                      </Button>
                    </div>
                  ) : null}
                </li>
              )
            })}
          </ul>
        )}
      </DashboardPanel>
    </div>
  )
}
