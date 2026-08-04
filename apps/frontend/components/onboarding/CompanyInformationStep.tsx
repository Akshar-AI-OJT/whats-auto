'use client'

import { useId, useRef } from 'react'
import { useTranslations } from 'next-intl'
import { ImagePlus, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getTimezoneOptions } from '@/lib/onboarding'
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from '@/components/ui/field'
import { authInputClassName } from '@/components/auth/auth-field-styles'
import { RequiredAsterisk } from './required-asterisk'
import {
  COMPANY_SIZE_OPTIONS,
  COUNTRY_OPTIONS,
  CURRENCY_OPTIONS,
  INDUSTRY_OPTIONS,
  type OrganizationWizardCompanyErrors,
  type OrganizationWizardState,
} from './organization-wizard-types'

const selectClassName = cn(
  authInputClassName,
  'h-11 w-full appearance-none rounded-xl px-3.5 text-sm text-ink outline-none'
)

type CompanyInformationStepProps = {
  state: OrganizationWizardState
  errors: OrganizationWizardCompanyErrors
  pending: boolean
  onChange: (patch: Partial<OrganizationWizardState>) => void
  onClearError: (key: keyof OrganizationWizardCompanyErrors) => void
}

export function CompanyInformationStep({
  state,
  errors,
  pending,
  onChange,
  onClearError,
}: CompanyInformationStepProps) {
  const t = useTranslations('onboarding.organization')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const logoId = useId()
  const industryId = useId()
  const sizeId = useId()
  const countryId = useId()
  const timezoneId = useId()
  const currencyId = useId()
  const industryErrorId = useId()
  const sizeErrorId = useId()
  const countryErrorId = useId()
  const timezoneErrorId = useId()
  const currencyErrorId = useId()
  const timezones = getTimezoneOptions()

  function handleLogoChange(file: File | null) {
    if (state.logoPreviewUrl) {
      URL.revokeObjectURL(state.logoPreviewUrl)
    }
    if (!file) {
      onChange({ logoFileName: '', logoPreviewUrl: null })
      return
    }
    onChange({
      logoFileName: file.name,
      logoPreviewUrl: URL.createObjectURL(file),
    })
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2 text-left">
        <h2 className="font-display text-[1.5rem] leading-7 tracking-tight text-ink sm:text-[1.75rem] sm:leading-8">
          {t('step2.title')}
        </h2>
        <p className="text-sm leading-6 text-pretty text-body">{t('step2.subtitle')}</p>
      </div>

      <Field className="gap-2">
        <FieldLabel htmlFor={logoId} className="text-sm font-medium leading-5 text-ink">
          {t('step2.logo')}
        </FieldLabel>
        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={pending}
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              'relative flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-dashed border-[#CBD5E1] bg-[#F8FAFC]',
              'transition-[border-color,background-color] duration-200 hover:border-primary/50 hover:bg-primary-pale/40',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30'
            )}
            aria-label={t('step2.logoUpload')}
          >
            {state.logoPreviewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={state.logoPreviewUrl}
                alt=""
                className="size-full object-cover"
              />
            ) : (
              <ImagePlus className="size-5 text-mute" aria-hidden />
            )}
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-ink">
              {state.logoFileName || t('step2.logoEmpty')}
            </p>
            <FieldDescription className="text-xs leading-4 text-mute">
              {t('step2.logoHint')}
            </FieldDescription>
            {state.logoPreviewUrl ? (
              <button
                type="button"
                disabled={pending}
                className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-negative hover:underline"
                onClick={() => {
                  handleLogoChange(null)
                  if (fileInputRef.current) fileInputRef.current.value = ''
                }}
              >
                <X className="size-3" aria-hidden />
                {t('step2.logoRemove')}
              </button>
            ) : null}
          </div>
          <input
            ref={fileInputRef}
            id={logoId}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="sr-only"
            disabled={pending}
            onChange={(e) => handleLogoChange(e.target.files?.[0] ?? null)}
          />
        </div>
      </Field>

      <Field data-invalid={errors.industry ? true : undefined} className="gap-2">
        <FieldLabel htmlFor={industryId} className="text-sm font-medium leading-5 text-ink">
          {t('step2.industry')}
          <RequiredAsterisk />
        </FieldLabel>
        <select
          id={industryId}
          name="industry"
          disabled={pending}
          value={state.industry}
          aria-invalid={Boolean(errors.industry)}
          aria-describedby={errors.industry ? industryErrorId : undefined}
          className={selectClassName}
          onChange={(e) => {
            onChange({
              industry: e.target.value as OrganizationWizardState['industry'],
            })
            onClearError('industry')
          }}
        >
          <option value="">{t('step2.industryPlaceholder')}</option>
          {INDUSTRY_OPTIONS.map((value) => (
            <option key={value} value={value}>
              {t(`step2.industries.${value}`)}
            </option>
          ))}
        </select>
        {errors.industry ? (
          <FieldError id={industryErrorId} className="text-xs leading-4 text-negative">
            {errors.industry}
          </FieldError>
        ) : null}
      </Field>

      <Field data-invalid={errors.companySize ? true : undefined} className="gap-2">
        <FieldLabel htmlFor={sizeId} className="text-sm font-medium leading-5 text-ink">
          {t('step2.companySize')}
          <RequiredAsterisk />
        </FieldLabel>
        <select
          id={sizeId}
          name="companySize"
          disabled={pending}
          value={state.companySize}
          aria-invalid={Boolean(errors.companySize)}
          aria-describedby={errors.companySize ? sizeErrorId : undefined}
          className={selectClassName}
          onChange={(e) => {
            onChange({
              companySize: e.target.value as OrganizationWizardState['companySize'],
            })
            onClearError('companySize')
          }}
        >
          <option value="">{t('step2.companySizePlaceholder')}</option>
          {COMPANY_SIZE_OPTIONS.map((value) => (
            <option key={value} value={value}>
              {t(`step2.companySizes.${value}`)}
            </option>
          ))}
        </select>
        {errors.companySize ? (
          <FieldError id={sizeErrorId} className="text-xs leading-4 text-negative">
            {errors.companySize}
          </FieldError>
        ) : null}
      </Field>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Field data-invalid={errors.country ? true : undefined} className="gap-2">
          <FieldLabel htmlFor={countryId} className="text-sm font-medium leading-5 text-ink">
            {t('step2.country')}
            <RequiredAsterisk />
          </FieldLabel>
          <select
            id={countryId}
            name="country"
            required
            disabled={pending}
            value={state.country}
            aria-invalid={Boolean(errors.country)}
            aria-describedby={errors.country ? countryErrorId : undefined}
            className={selectClassName}
            onChange={(e) => {
              onChange({ country: e.target.value })
              onClearError('country')
            }}
          >
            <option value="">{t('step2.countryPlaceholder')}</option>
            {COUNTRY_OPTIONS.map((country) => (
              <option key={country.code} value={country.code}>
                {t(`step2.countries.${country.labelKey}`)}
              </option>
            ))}
          </select>
          {errors.country ? (
            <FieldError id={countryErrorId} className="text-xs leading-4 text-negative">
              {errors.country}
            </FieldError>
          ) : null}
        </Field>

        <Field data-invalid={errors.timezone ? true : undefined} className="gap-2">
          <FieldLabel htmlFor={timezoneId} className="text-sm font-medium leading-5 text-ink">
            {t('step2.timezone')}
            <RequiredAsterisk />
          </FieldLabel>
          <select
            id={timezoneId}
            name="timezone"
            required
            disabled={pending}
            value={state.timezone}
            aria-invalid={Boolean(errors.timezone)}
            aria-describedby={errors.timezone ? timezoneErrorId : undefined}
            className={selectClassName}
            onChange={(e) => {
              onChange({ timezone: e.target.value })
              onClearError('timezone')
            }}
          >
            <option value="">{t('step2.timezonePlaceholder')}</option>
            {timezones.map((zone) => (
              <option key={zone} value={zone}>
                {zone.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
          {errors.timezone ? (
            <FieldError id={timezoneErrorId} className="text-xs leading-4 text-negative">
              {errors.timezone}
            </FieldError>
          ) : null}
        </Field>
      </div>

      <Field data-invalid={errors.currency ? true : undefined} className="gap-2">
        <FieldLabel htmlFor={currencyId} className="text-sm font-medium leading-5 text-ink">
          {t('step2.currency')}
        </FieldLabel>
        <select
          id={currencyId}
          name="currency"
          disabled={pending}
          value={state.currency}
          aria-invalid={Boolean(errors.currency)}
          aria-describedby={errors.currency ? currencyErrorId : undefined}
          className={selectClassName}
          onChange={(e) => {
            onChange({
              currency: e.target.value as OrganizationWizardState['currency'],
            })
            onClearError('currency')
          }}
        >
          <option value="">{t('step2.currencyPlaceholder')}</option>
          {CURRENCY_OPTIONS.map((value) => (
            <option key={value} value={value}>
              {t(`step2.currencies.${value}`)}
            </option>
          ))}
        </select>
        <FieldDescription className="text-xs leading-4 text-mute">
          {t('optionalHint')}
        </FieldDescription>
        {errors.currency ? (
          <FieldError id={currencyErrorId} className="text-xs leading-4 text-negative">
            {errors.currency}
          </FieldError>
        ) : null}
      </Field>
    </div>
  )
}
