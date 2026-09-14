'use client'

import { useId, useRef } from 'react'
import { useTranslations } from 'next-intl'
import { CloudUpload, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getTimezoneOptions } from '@/lib/onboarding'
import {
  Field,
  FieldError,
  FieldLabel,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { RequiredAsterisk } from './required-asterisk'
import { OnboardingSelect } from './OnboardingSelect'
import {
  onboardingFieldClassName,
  onboardingFieldLabelClassName,
  onboardingInputClassName,
} from './onboarding-field-styles'
import {
  COMPANY_SIZE_OPTIONS,
  COUNTRY_OPTIONS,
  CURRENCY_OPTIONS,
  INDUSTRY_OPTIONS,
  ORGANIZATION_TYPE_OPTIONS,
  type OrganizationWizardCompanyErrors,
  type OrganizationWizardState,
} from './organization-wizard-types'

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
  const organizationTypeId = useId()
  const addressId = useId()
  const panId = useId()
  const gstinId = useId()
  const industryId = useId()
  const sizeId = useId()
  const countryId = useId()
  const timezoneId = useId()
  const currencyId = useId()
  const organizationTypeErrorId = useId()
  const addressErrorId = useId()
  const panErrorId = useId()
  const gstinErrorId = useId()
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
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2.5 text-left">
        <h2 className="font-display text-[1.5rem] leading-7 tracking-tight text-ink sm:text-[1.75rem] sm:leading-8">
          {t('step2.title')}
        </h2>
        <p className="text-sm leading-6 text-pretty text-body">{t('step2.subtitle')}</p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:gap-x-5">
        <Field className={cn(onboardingFieldClassName, 'lg:row-span-2')}>
          <FieldLabel htmlFor={logoId} className={onboardingFieldLabelClassName}>
            {t('step2.logo')}
          </FieldLabel>
          <button
            type="button"
            disabled={pending}
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              'relative flex min-h-[10.5rem] w-full flex-col items-center justify-center gap-2 overflow-hidden rounded-xl border border-dashed border-[#94A3B8] bg-[#F8FAFC] px-4 py-5 text-center',
              'transition-[border-color,background-color] duration-200 hover:border-primary/50 hover:bg-primary-pale/40',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30',
              'disabled:cursor-not-allowed disabled:opacity-60'
            )}
            aria-label={t('step2.logoUpload')}
          >
            {state.logoPreviewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={state.logoPreviewUrl}
                alt=""
                className="absolute inset-0 size-full object-cover"
              />
            ) : (
              <>
                <span className="flex size-10 items-center justify-center rounded-xl bg-canvas text-mute shadow-sm">
                  <CloudUpload className="size-5" aria-hidden />
                </span>
                <span className="text-sm font-semibold text-ink">{t('step2.logoUploadTitle')}</span>
                <span className="text-xs leading-4 text-mute">{t('step2.logoHint')}</span>
              </>
            )}
          </button>
          {state.logoPreviewUrl ? (
            <div className="flex items-center justify-between gap-2">
              <p className="truncate text-xs font-medium text-ink">{state.logoFileName}</p>
              <button
                type="button"
                disabled={pending}
                className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-negative hover:underline"
                onClick={() => {
                  handleLogoChange(null)
                  if (fileInputRef.current) fileInputRef.current.value = ''
                }}
              >
                <X className="size-3" aria-hidden />
                {t('step2.logoRemove')}
              </button>
            </div>
          ) : null}
          <input
            ref={fileInputRef}
            id={logoId}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="sr-only"
            disabled={pending}
            onChange={(e) => handleLogoChange(e.target.files?.[0] ?? null)}
          />
        </Field>

        <Field data-invalid={errors.organizationType ? true : undefined} className={onboardingFieldClassName}>
          <FieldLabel htmlFor={organizationTypeId} className={onboardingFieldLabelClassName}>
            {t('step2.organizationType')}
            <RequiredAsterisk />
          </FieldLabel>
          <OnboardingSelect
            id={organizationTypeId}
            name="organizationType"
            required
            disabled={pending}
            value={state.organizationType}
            aria-invalid={Boolean(errors.organizationType)}
            aria-describedby={errors.organizationType ? organizationTypeErrorId : undefined}
            onChange={(e) => {
              onChange({
                organizationType: e.target.value as OrganizationWizardState['organizationType'],
              })
              onClearError('organizationType')
            }}
          >
            <option value="">{t('step2.organizationTypePlaceholder')}</option>
            {ORGANIZATION_TYPE_OPTIONS.map((value) => (
              <option key={value} value={value}>
                {t(`step2.organizationTypes.${value}`)}
              </option>
            ))}
          </OnboardingSelect>
          {errors.organizationType ? (
            <FieldError id={organizationTypeErrorId} className="text-xs leading-4 text-negative">
              {errors.organizationType}
            </FieldError>
          ) : null}
        </Field>

        <Field data-invalid={errors.address ? true : undefined} className={onboardingFieldClassName}>
          <FieldLabel htmlFor={addressId} className={onboardingFieldLabelClassName}>
            {t('step2.address')}
            <RequiredAsterisk />
          </FieldLabel>
          <Input
            id={addressId}
            name="address"
            type="text"
            required
            maxLength={500}
            disabled={pending}
            placeholder={t('step2.addressPlaceholder')}
            aria-invalid={Boolean(errors.address)}
            aria-describedby={errors.address ? addressErrorId : undefined}
            className={onboardingInputClassName}
            value={state.address}
            onChange={(e) => {
              onChange({ address: e.target.value })
              onClearError('address')
            }}
          />
          {errors.address ? (
            <FieldError id={addressErrorId} className="text-xs leading-4 text-negative">
              {errors.address}
            </FieldError>
          ) : null}
        </Field>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Field data-invalid={errors.pan ? true : undefined} className={onboardingFieldClassName}>
          <FieldLabel htmlFor={panId} className={onboardingFieldLabelClassName}>
            {t('step2.pan')}
            <RequiredAsterisk />
          </FieldLabel>
          <Input
            id={panId}
            name="pan"
            type="text"
            required
            maxLength={10}
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            disabled={pending}
            placeholder={t('step2.panPlaceholder')}
            aria-invalid={Boolean(errors.pan)}
            aria-describedby={errors.pan ? panErrorId : undefined}
            className={onboardingInputClassName}
            value={state.pan}
            onChange={(e) => {
              onChange({ pan: e.target.value.replace(/\s+/g, '').toUpperCase().slice(0, 10) })
              onClearError('pan')
            }}
          />
          {errors.pan ? (
            <FieldError id={panErrorId} className="text-xs leading-4 text-negative">
              {errors.pan}
            </FieldError>
          ) : null}
        </Field>

        <Field data-invalid={errors.gstin ? true : undefined} className={onboardingFieldClassName}>
          <FieldLabel htmlFor={gstinId} className={onboardingFieldLabelClassName}>
            {t('step2.gstin')}
          </FieldLabel>
          <Input
            id={gstinId}
            name="gstin"
            type="text"
            maxLength={15}
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            disabled={pending}
            placeholder={t('step2.gstinPlaceholder')}
            aria-invalid={Boolean(errors.gstin)}
            aria-describedby={errors.gstin ? gstinErrorId : undefined}
            className={onboardingInputClassName}
            value={state.gstin}
            onChange={(e) => {
              onChange({ gstin: e.target.value.replace(/\s+/g, '').toUpperCase().slice(0, 15) })
              onClearError('gstin')
            }}
          />
          {errors.gstin ? (
            <FieldError id={gstinErrorId} className="text-xs leading-4 text-negative">
              {errors.gstin}
            </FieldError>
          ) : null}
        </Field>
      </div>

        <Field data-invalid={errors.industry ? true : undefined} className={onboardingFieldClassName}>
          <FieldLabel htmlFor={industryId} className={onboardingFieldLabelClassName}>
            {t('step2.industry')}
            <RequiredAsterisk />
          </FieldLabel>
          <OnboardingSelect
            id={industryId}
            name="industry"
            disabled={pending}
            value={state.industry}
            aria-invalid={Boolean(errors.industry)}
            aria-describedby={errors.industry ? industryErrorId : undefined}
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
          </OnboardingSelect>
          {errors.industry ? (
            <FieldError id={industryErrorId} className="text-xs leading-4 text-negative">
              {errors.industry}
            </FieldError>
          ) : null}
        </Field>

        <Field data-invalid={errors.companySize ? true : undefined} className={onboardingFieldClassName}>
          <FieldLabel htmlFor={sizeId} className={onboardingFieldLabelClassName}>
            {t('step2.companySize')}
            <RequiredAsterisk />
          </FieldLabel>
          <OnboardingSelect
            id={sizeId}
            name="companySize"
            disabled={pending}
            value={state.companySize}
            aria-invalid={Boolean(errors.companySize)}
            aria-describedby={errors.companySize ? sizeErrorId : undefined}
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
          </OnboardingSelect>
          {errors.companySize ? (
            <FieldError id={sizeErrorId} className="text-xs leading-4 text-negative">
              {errors.companySize}
            </FieldError>
          ) : null}
        </Field>

        <Field data-invalid={errors.country ? true : undefined} className={onboardingFieldClassName}>
          <FieldLabel htmlFor={countryId} className={onboardingFieldLabelClassName}>
            {t('step2.country')}
            <RequiredAsterisk />
          </FieldLabel>
          <OnboardingSelect
            id={countryId}
            name="country"
            required
            disabled={pending}
            value={state.country}
            aria-invalid={Boolean(errors.country)}
            aria-describedby={errors.country ? countryErrorId : undefined}
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
          </OnboardingSelect>
          {errors.country ? (
            <FieldError id={countryErrorId} className="text-xs leading-4 text-negative">
              {errors.country}
            </FieldError>
          ) : null}
        </Field>

        <Field data-invalid={errors.timezone ? true : undefined} className={onboardingFieldClassName}>
          <FieldLabel htmlFor={timezoneId} className={onboardingFieldLabelClassName}>
            {t('step2.timezone')}
            <RequiredAsterisk />
          </FieldLabel>
          <OnboardingSelect
            id={timezoneId}
            name="timezone"
            required
            disabled={pending}
            value={state.timezone}
            aria-invalid={Boolean(errors.timezone)}
            aria-describedby={errors.timezone ? timezoneErrorId : undefined}
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
          </OnboardingSelect>
          {errors.timezone ? (
            <FieldError id={timezoneErrorId} className="text-xs leading-4 text-negative">
              {errors.timezone}
            </FieldError>
          ) : null}
        </Field>

        <Field data-invalid={errors.currency ? true : undefined} className={onboardingFieldClassName}>
          <FieldLabel htmlFor={currencyId} className={onboardingFieldLabelClassName}>
            {t('step2.currency')}
            <span className="ml-1.5 text-xs font-normal text-mute">{t('optionalHint')}</span>
          </FieldLabel>
          <OnboardingSelect
            id={currencyId}
            name="currency"
            disabled={pending}
            value={state.currency}
            aria-invalid={Boolean(errors.currency)}
            aria-describedby={errors.currency ? currencyErrorId : undefined}
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
          </OnboardingSelect>
          {errors.currency ? (
            <FieldError id={currencyErrorId} className="text-xs leading-4 text-negative">
              {errors.currency}
            </FieldError>
          ) : null}
        </Field>
      </div>
    </div>
  )
}
