'use client'

import { useId } from 'react'
import { useTranslations } from 'next-intl'
import { Building2, Globe, Info, Link2, Mail, Phone } from 'lucide-react'
import { slugifyOrganizationName } from '@/lib/onboarding'
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  onboardingFieldClassName,
  onboardingFieldLabelClassName,
  onboardingInputWithIconClassName,
} from './onboarding-field-styles'
import { RequiredAsterisk } from './required-asterisk'
import type {
  OrganizationWizardBasicsErrors,
  OrganizationWizardState,
} from './organization-wizard-types'

type OrganizationBasicsStepProps = {
  state: OrganizationWizardState
  errors: OrganizationWizardBasicsErrors
  pending: boolean
  onChange: (patch: Partial<OrganizationWizardState>) => void
  onClearError: (key: keyof OrganizationWizardBasicsErrors) => void
}

export function OrganizationBasicsStep({
  state,
  errors,
  pending,
  onChange,
  onClearError,
}: OrganizationBasicsStepProps) {
  const t = useTranslations('onboarding.organization')

  const nameId = useId()
  const slugId = useId()
  const emailId = useId()
  const phoneId = useId()
  const websiteId = useId()
  const slugHintId = useId()
  const nameErrorId = useId()
  const slugErrorId = useId()
  const emailErrorId = useId()
  const phoneErrorId = useId()
  const websiteErrorId = useId()

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2.5 text-left">
        <h2 className="font-display text-[1.5rem] leading-7 tracking-tight text-ink sm:text-[1.75rem] sm:leading-8">
          {t('step1.title')}
        </h2>
        <p className="text-sm leading-6 text-pretty text-body">{t('step1.subtitle')}</p>
        <p className="flex items-start gap-2.5 rounded-xl border border-primary/20 bg-primary-pale px-3.5 py-3 text-xs leading-5 text-positive-deep">
          <Info className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
          <span>{t('ownerNote')}</span>
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6">
        <Field data-invalid={errors.name ? true : undefined} className={onboardingFieldClassName}>
          <FieldLabel htmlFor={nameId} className={onboardingFieldLabelClassName}>
            {t('name')}
            <RequiredAsterisk />
          </FieldLabel>
          <div className="relative">
            <Building2
              className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-mute"
              aria-hidden
            />
            <Input
              id={nameId}
              name="name"
              type="text"
              autoComplete="organization"
              placeholder={t('namePlaceholder')}
              required
              maxLength={200}
              disabled={pending}
              aria-invalid={Boolean(errors.name)}
              aria-describedby={errors.name ? nameErrorId : undefined}
              className={onboardingInputWithIconClassName}
              value={state.name}
              onChange={(e) => {
                const nextName = e.target.value
                onClearError('name')
                if (!state.slugTouched) {
                  onChange({
                    name: nextName,
                    slug: slugifyOrganizationName(nextName),
                  })
                  onClearError('slug')
                } else {
                  onChange({ name: nextName })
                }
              }}
            />
          </div>
          {errors.name ? (
            <FieldError id={nameErrorId} className="text-xs leading-4 text-negative">
              {errors.name}
            </FieldError>
          ) : null}
        </Field>

        <Field data-invalid={errors.slug ? true : undefined} className={onboardingFieldClassName}>
          <FieldLabel htmlFor={slugId} className={onboardingFieldLabelClassName}>
            {t('slug')}
            <RequiredAsterisk />
          </FieldLabel>
          <div className="relative">
            <Link2
              className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-mute"
              aria-hidden
            />
            <Input
              id={slugId}
              name="slug"
              type="text"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              placeholder={t('slugPlaceholder')}
              required
              maxLength={100}
              disabled={pending}
              aria-invalid={Boolean(errors.slug)}
              aria-describedby={
                [errors.slug ? slugErrorId : null, slugHintId].filter(Boolean).join(' ') ||
                undefined
              }
              className={onboardingInputWithIconClassName}
              value={state.slug}
              onChange={(e) => {
                onChange({
                  slugTouched: true,
                  slug: e.target.value.toLowerCase().replace(/\s+/g, '-'),
                })
                onClearError('slug')
              }}
            />
          </div>
          <FieldDescription id={slugHintId} className="text-xs leading-4 text-mute">
            {t('slugHint')}
          </FieldDescription>
          {errors.slug ? (
            <FieldError id={slugErrorId} className="text-xs leading-4 text-negative">
              {errors.slug}
            </FieldError>
          ) : null}
        </Field>

        <Field data-invalid={errors.email ? true : undefined} className={onboardingFieldClassName}>
          <FieldLabel htmlFor={emailId} className={onboardingFieldLabelClassName}>
            {t('email')}
            <RequiredAsterisk />
          </FieldLabel>
          <div className="relative">
            <Mail
              className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-mute"
              aria-hidden
            />
            <Input
              id={emailId}
              name="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder={t('emailPlaceholder')}
              required
              disabled={pending}
              aria-invalid={Boolean(errors.email)}
              aria-describedby={errors.email ? emailErrorId : undefined}
              className={onboardingInputWithIconClassName}
              value={state.email}
              onChange={(e) => {
                onChange({ email: e.target.value })
                onClearError('email')
              }}
            />
          </div>
          {errors.email ? (
            <FieldError id={emailErrorId} className="text-xs leading-4 text-negative">
              {errors.email}
            </FieldError>
          ) : null}
        </Field>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 sm:gap-x-5">
          <Field data-invalid={errors.phone ? true : undefined} className={onboardingFieldClassName}>
            <FieldLabel htmlFor={phoneId} className={onboardingFieldLabelClassName}>
              {t('phone')}
              <RequiredAsterisk />
            </FieldLabel>
            <div className="relative">
              <Phone
                className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-mute"
                aria-hidden
              />
              <Input
                id={phoneId}
                name="phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder={t('phonePlaceholder')}
                required
                disabled={pending}
                aria-invalid={Boolean(errors.phone)}
                aria-describedby={errors.phone ? phoneErrorId : undefined}
                className={onboardingInputWithIconClassName}
                value={state.phone}
                onChange={(e) => {
                  onChange({ phone: e.target.value })
                  onClearError('phone')
                }}
              />
            </div>
            {errors.phone ? (
              <FieldError id={phoneErrorId} className="text-xs leading-4 text-negative">
                {errors.phone}
              </FieldError>
            ) : null}
          </Field>

          <Field data-invalid={errors.website ? true : undefined} className={onboardingFieldClassName}>
            <FieldLabel htmlFor={websiteId} className={onboardingFieldLabelClassName}>
              {t('website')}
              <span className="ml-1.5 text-xs font-normal text-mute">{t('optionalHint')}</span>
            </FieldLabel>
            <div className="relative">
              <Globe
                className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-mute"
                aria-hidden
              />
              <Input
                id={websiteId}
                name="website"
                type="url"
                inputMode="url"
                autoComplete="url"
                placeholder={t('websitePlaceholder')}
                disabled={pending}
                aria-invalid={Boolean(errors.website)}
                aria-describedby={errors.website ? websiteErrorId : undefined}
                className={onboardingInputWithIconClassName}
                value={state.website}
                onChange={(e) => {
                  onChange({ website: e.target.value })
                  onClearError('website')
                }}
              />
            </div>
            {errors.website ? (
              <FieldError id={websiteErrorId} className="text-xs leading-4 text-negative">
                {errors.website}
              </FieldError>
            ) : null}
          </Field>
        </div>
      </div>
    </div>
  )
}
