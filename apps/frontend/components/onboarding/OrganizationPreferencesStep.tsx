'use client'

import { useId } from 'react'
import { useTranslations } from 'next-intl'
import { CalendarDays, Clock3, Globe, Monitor, Moon, Sun } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  Field,
  FieldError,
  FieldLabel,
} from '@/components/ui/field'
import { RequiredAsterisk } from './required-asterisk'
import { OnboardingSelect } from './OnboardingSelect'
import {
  onboardingFieldClassName,
  onboardingFieldLabelClassName,
} from './onboarding-field-styles'
import {
  DATE_FORMAT_OPTIONS,
  LANGUAGE_OPTIONS,
  NOTIFICATION_OPTIONS,
  THEME_PREFERENCE_OPTIONS,
  TIME_FORMAT_OPTIONS,
  type NotificationOption,
  type OrganizationWizardPreferencesErrors,
  type OrganizationWizardState,
  type ThemePreferenceOption,
} from './organization-wizard-types'

const THEME_ICONS: Record<ThemePreferenceOption, typeof Monitor> = {
  system: Monitor,
  light: Sun,
  dark: Moon,
}

type OrganizationPreferencesStepProps = {
  state: OrganizationWizardState
  errors: OrganizationWizardPreferencesErrors
  pending: boolean
  onChange: (patch: Partial<OrganizationWizardState>) => void
  onClearError: (key: keyof OrganizationWizardPreferencesErrors) => void
  hideIntro?: boolean
}

export function OrganizationPreferencesStep({
  state,
  errors,
  pending,
  onChange,
  onClearError,
  hideIntro = false,
}: OrganizationPreferencesStepProps) {
  const t = useTranslations('onboarding.organization')

  const languageId = useId()
  const dateFormatId = useId()
  const timeFormatId = useId()
  const themeId = useId()
  const notificationsId = useId()
  const languageErrorId = useId()
  const dateErrorId = useId()
  const timeErrorId = useId()
  const themeErrorId = useId()

  function toggleNotification(option: NotificationOption) {
    const exists = state.notifications.includes(option)
    onChange({
      notifications: exists
        ? state.notifications.filter((item) => item !== option)
        : [...state.notifications, option],
    })
  }

  return (
    <div className="flex flex-col gap-6">
      {!hideIntro ? (
        <div className="flex flex-col gap-2.5 text-left">
          <h2 className="font-display text-[1.5rem] leading-7 tracking-tight text-ink sm:text-[1.75rem] sm:leading-8">
            {t('step3.title')}
          </h2>
          <p className="text-sm leading-6 text-pretty text-body">{t('step3.subtitle')}</p>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 sm:gap-x-5 lg:grid-cols-3">
        <Field data-invalid={errors.defaultLanguage ? true : undefined} className={onboardingFieldClassName}>
          <FieldLabel htmlFor={languageId} className={onboardingFieldLabelClassName}>
            {t('step3.defaultLanguage')}
            <RequiredAsterisk />
          </FieldLabel>
          <OnboardingSelect
            id={languageId}
            name="defaultLanguage"
            icon={Globe}
            disabled={pending}
            value={state.defaultLanguage}
            aria-invalid={Boolean(errors.defaultLanguage)}
            aria-describedby={errors.defaultLanguage ? languageErrorId : undefined}
            onChange={(e) => {
              onChange({
                defaultLanguage: e.target
                  .value as OrganizationWizardState['defaultLanguage'],
              })
              onClearError('defaultLanguage')
            }}
          >
            {LANGUAGE_OPTIONS.map((value) => (
              <option key={value} value={value}>
                {t(`step3.languages.${value}`)}
              </option>
            ))}
          </OnboardingSelect>
          {errors.defaultLanguage ? (
            <FieldError id={languageErrorId} className="text-xs leading-4 text-negative">
              {errors.defaultLanguage}
            </FieldError>
          ) : null}
        </Field>

        <Field data-invalid={errors.dateFormat ? true : undefined} className={onboardingFieldClassName}>
          <FieldLabel htmlFor={dateFormatId} className={onboardingFieldLabelClassName}>
            {t('step3.dateFormat')}
            <RequiredAsterisk />
          </FieldLabel>
          <OnboardingSelect
            id={dateFormatId}
            name="dateFormat"
            icon={CalendarDays}
            disabled={pending}
            value={state.dateFormat}
            aria-invalid={Boolean(errors.dateFormat)}
            aria-describedby={errors.dateFormat ? dateErrorId : undefined}
            onChange={(e) => {
              onChange({
                dateFormat: e.target.value as OrganizationWizardState['dateFormat'],
              })
              onClearError('dateFormat')
            }}
          >
            {DATE_FORMAT_OPTIONS.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </OnboardingSelect>
          {errors.dateFormat ? (
            <FieldError id={dateErrorId} className="text-xs leading-4 text-negative">
              {errors.dateFormat}
            </FieldError>
          ) : null}
        </Field>

        <Field data-invalid={errors.timeFormat ? true : undefined} className={cn(onboardingFieldClassName, 'sm:col-span-2 lg:col-span-1')}>
          <FieldLabel htmlFor={timeFormatId} className={onboardingFieldLabelClassName}>
            {t('step3.timeFormat')}
            <RequiredAsterisk />
          </FieldLabel>
          <OnboardingSelect
            id={timeFormatId}
            name="timeFormat"
            icon={Clock3}
            disabled={pending}
            value={state.timeFormat}
            aria-invalid={Boolean(errors.timeFormat)}
            aria-describedby={errors.timeFormat ? timeErrorId : undefined}
            onChange={(e) => {
              onChange({
                timeFormat: e.target.value as OrganizationWizardState['timeFormat'],
              })
              onClearError('timeFormat')
            }}
          >
            {TIME_FORMAT_OPTIONS.map((value) => (
              <option key={value} value={value}>
                {t(`step3.timeFormats.${value}`)}
              </option>
            ))}
          </OnboardingSelect>
          {errors.timeFormat ? (
            <FieldError id={timeErrorId} className="text-xs leading-4 text-negative">
              {errors.timeFormat}
            </FieldError>
          ) : null}
        </Field>
      </div>

      <Field data-invalid={errors.themePreference ? true : undefined} className={onboardingFieldClassName}>
        <FieldLabel className={onboardingFieldLabelClassName}>
          {t('step3.themePreference')}
          <RequiredAsterisk />
        </FieldLabel>
        <div
          id={themeId}
          role="radiogroup"
          aria-label={t('step3.themePreference')}
          className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-3"
        >
          {THEME_PREFERENCE_OPTIONS.map((value) => {
            const selected = state.themePreference === value
            const Icon = THEME_ICONS[value]
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={pending}
                onClick={() => {
                  onChange({ themePreference: value })
                  onClearError('themePreference')
                }}
                className={cn(
                  'flex flex-col items-start gap-1.5 rounded-xl border px-3.5 py-3.5 text-left transition-colors duration-150',
                  selected
                    ? 'border-primary bg-primary-pale text-positive-deep'
                    : 'border-[#CBD5E1] bg-canvas text-ink hover:border-[#94A3B8] hover:bg-[#F8FAFC]'
                )}
              >
                <Icon
                  className={cn('size-4', selected ? 'text-primary' : 'text-mute')}
                  aria-hidden
                />
                <span className="text-sm font-semibold text-ink">
                  {t(`step3.themes.${value}`)}
                </span>
                <span className="text-xs leading-4 text-mute">
                  {t(`step3.themeDescriptions.${value}`)}
                </span>
              </button>
            )
          })}
        </div>
        {errors.themePreference ? (
          <FieldError id={themeErrorId} className="text-xs leading-4 text-negative">
            {errors.themePreference}
          </FieldError>
        ) : null}
      </Field>

      <Field className={onboardingFieldClassName}>
        <FieldLabel className={onboardingFieldLabelClassName}>
          {t('step3.notifications')}
        </FieldLabel>
        <div
          id={notificationsId}
          className="flex flex-col gap-2.5"
          role="group"
          aria-label={t('step3.notifications')}
        >
          {NOTIFICATION_OPTIONS.map((option) => {
            const checked = state.notifications.includes(option)
            const optionId = `${notificationsId}-${option}`
            return (
              <label
                key={option}
                htmlFor={optionId}
                className={cn(
                  'flex cursor-pointer items-start gap-3 rounded-xl border px-3.5 py-3',
                  'transition-colors duration-150',
                  checked
                    ? 'border-primary/40 bg-primary-pale/70'
                    : 'border-[#CBD5E1] bg-canvas hover:border-[#94A3B8] hover:bg-[#F8FAFC]'
                )}
              >
                <input
                  id={optionId}
                  type="checkbox"
                  className="mt-0.5 size-4 shrink-0 rounded border-[#CBD5E1] text-primary accent-primary focus-visible:ring-2 focus-visible:ring-primary/30"
                  checked={checked}
                  disabled={pending}
                  onChange={() => toggleNotification(option)}
                />
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-ink">
                    {t(`step3.notificationOptions.${option}.label`)}
                  </span>
                  <span className="mt-0.5 block text-xs leading-4 text-mute">
                    {t(`step3.notificationOptions.${option}.description`)}
                  </span>
                </span>
              </label>
            )
          })}
        </div>
      </Field>
    </div>
  )
}
