'use client'

import { useQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { Loader2, Mail, RefreshCw, UserRound } from 'lucide-react'
import { api, type ApiError, type ProfileUser } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { DashboardPanel } from '@/components/dashboard/ui/DashboardPanel'
import { DashboardSectionHeader } from '@/components/dashboard/ui/DashboardSectionHeader'
import { cn } from '@/lib/utils'
import {
  authInputWithIconClassName,
} from '@/components/auth/auth-field-styles'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { queryKeys } from '@/lib/query-keys'

function unwrapProfile(data: unknown): ProfileUser | null {
  if (!data) return null
  if (typeof data === 'object' && data !== null && 'id' in data && 'email' in data) {
    return data as ProfileUser
  }
  const wrapped = data as { data?: ProfileUser }
  return wrapped.data ?? null
}

function formatProfileDate(value: string | null | undefined) {
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

const readOnlyInputClassName = cn(authInputWithIconClassName, 'bg-dash-surface/70 text-body')

export function AccountProfilePage() {
  const t = useTranslations('dashboard.profile')

  const profileQuery = useQuery({
    queryKey: queryKeys.profile.detail(),
    queryFn: async () => {
      const { data } = await api.account.profile()
      return unwrapProfile(data)
    },
  })

  const profile = profileQuery.data ?? null
  const displayName =
    profile?.name?.trim() ||
    [profile?.firstname, profile?.lastname].filter(Boolean).join(' ').trim() ||
    null

  return (
    <div className="flex w-full min-w-0 flex-col gap-5 sm:gap-6">
      <DashboardPanel as="section" className="px-4 py-5 sm:px-6 sm:py-6 md:px-7 md:py-7">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold tracking-wide text-positive-deep uppercase">
              {t('eyebrow')}
            </p>
            <h1 className="mt-2 font-display text-[1.75rem] leading-tight tracking-tight text-ink sm:text-3xl">
              {t('title')}
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-body sm:text-base">
              {t('subtitle')}
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            className="shrink-0 gap-2"
            disabled={profileQuery.isFetching}
            onClick={() => profileQuery.refetch()}
          >
            <RefreshCw
              className={cn('size-4', profileQuery.isFetching && 'animate-spin')}
              aria-hidden
            />
            {t('refresh')}
          </Button>
        </div>
      </DashboardPanel>

      <DashboardPanel as="section" className="p-4 sm:p-5 md:p-6">
        <DashboardSectionHeader title={t('sectionTitle')} description={t('sectionDescription')} />

        {profileQuery.isLoading ? (
          <div className="mt-8 flex items-center justify-center gap-2 py-16 text-sm text-body">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            {t('loading')}
          </div>
        ) : profileQuery.isError ? (
          <div
            role="alert"
            className="mt-8 rounded-xl border border-negative/25 bg-negative/5 px-4 py-3 text-sm text-negative"
          >
            {(profileQuery.error as unknown as ApiError)?.message || t('errors.loadFailed')}
          </div>
        ) : !profile ? (
          <div className="mt-8 flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-dash-border bg-dash-surface/50 px-6 py-16 text-center">
            <span className="flex size-12 items-center justify-center rounded-2xl bg-primary-pale text-positive-deep">
              <UserRound className="size-5" aria-hidden />
            </span>
            <p className="font-medium text-ink">{t('emptyTitle')}</p>
            <p className="max-w-sm text-sm text-body">{t('emptyDescription')}</p>
          </div>
        ) : (
          <div className="mt-5 space-y-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-primary text-lg font-bold text-on-primary">
                {(profile.initials || displayName || profile.email || '?').slice(0, 2).toUpperCase()}
              </span>
              <div className="min-w-0">
                <p className="truncate font-display text-xl tracking-tight text-ink">
                  {displayName || t('unnamed')}
                </p>
                <p className="mt-0.5 truncate text-sm text-body">{profile.email}</p>
              </div>
            </div>

            <FieldGroup className="gap-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Field className="gap-2">
                  <FieldLabel>{t('fields.name')}</FieldLabel>
                  <div className="relative">
                    <UserRound
                      className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-mute"
                      aria-hidden
                    />
                    <Input
                      readOnly
                      value={profile.name || '—'}
                      className={readOnlyInputClassName}
                    />
                  </div>
                </Field>

                <Field className="gap-2">
                  <FieldLabel>{t('fields.email')}</FieldLabel>
                  <div className="relative">
                    <Mail
                      className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-mute"
                      aria-hidden
                    />
                    <Input
                      readOnly
                      value={profile.email || '—'}
                      className={readOnlyInputClassName}
                    />
                  </div>
                </Field>

                <Field className="gap-2">
                  <FieldLabel>{t('fields.firstname')}</FieldLabel>
                  <Input
                    readOnly
                    value={profile.firstname || '—'}
                    className={cn(authInputWithIconClassName, 'bg-dash-surface/70 pl-3.5 text-body')}
                  />
                </Field>

                <Field className="gap-2">
                  <FieldLabel>{t('fields.lastname')}</FieldLabel>
                  <Input
                    readOnly
                    value={profile.lastname || '—'}
                    className={cn(authInputWithIconClassName, 'bg-dash-surface/70 pl-3.5 text-body')}
                  />
                </Field>

                <Field className="gap-2">
                  <FieldLabel>{t('fields.initials')}</FieldLabel>
                  <Input
                    readOnly
                    value={profile.initials || '—'}
                    className={cn(authInputWithIconClassName, 'bg-dash-surface/70 pl-3.5 text-body')}
                  />
                </Field>

                <Field className="gap-2">
                  <FieldLabel>{t('fields.userId')}</FieldLabel>
                  <Input
                    readOnly
                    value={profile.id || '—'}
                    className={cn(
                      authInputWithIconClassName,
                      'bg-dash-surface/70 pl-3.5 font-mono text-xs text-body'
                    )}
                  />
                </Field>

                {formatProfileDate(profile.createdAt) ? (
                  <Field className="gap-2">
                    <FieldLabel>{t('fields.createdAt')}</FieldLabel>
                    <Input
                      readOnly
                      value={formatProfileDate(profile.createdAt) ?? '—'}
                      className={cn(
                        authInputWithIconClassName,
                        'bg-dash-surface/70 pl-3.5 text-body'
                      )}
                    />
                  </Field>
                ) : null}

                {formatProfileDate(profile.updatedAt) ? (
                  <Field className="gap-2">
                    <FieldLabel>{t('fields.updatedAt')}</FieldLabel>
                    <Input
                      readOnly
                      value={formatProfileDate(profile.updatedAt) ?? '—'}
                      className={cn(
                        authInputWithIconClassName,
                        'bg-dash-surface/70 pl-3.5 text-body'
                      )}
                    />
                  </Field>
                ) : null}
              </div>
            </FieldGroup>

            <p className="text-xs text-mute">{t('readOnlyNotice')}</p>
          </div>
        )}
      </DashboardPanel>
    </div>
  )
}
