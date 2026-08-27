'use client'

import { useId } from 'react'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from '@/components/ui/field'
import { authInputClassName } from '@/components/auth/auth-field-styles'
import { RequiredAsterisk } from './required-asterisk'
import {
  DATE_FORMAT_OPTIONS,
  LANGUAGE_OPTIONS,
  NOTIFICATION_OPTIONS,
  THEME_PREFERENCE_OPTIONS,
  TIME_FORMAT_OPTIONS,
  type NotificationOption,
  type OrganizationWizardPreferencesErrors,
  type OrganizationWizardState,
} from './organization-wizard-types'

const selectClassName = cn(
  authInputClassName,
  'h-11 w-full cursor-pointer appearance-none rounded-xl px-3.5 text-sm text-ink outline-none'
)

type WorkspacePreferencesStepProps = {
  state: OrganizationWizardState
  errors: OrganizationWizardPreferencesErrors
  pending: boolean
  onChange: (patch: Partial<OrganizationWizardState>) => void
  onClearError: (key: keyof OrganizationWizardPreferencesErrors) => void
}

export function WorkspacePreferencesStep({
  state,
  errors,
  pending,
  onChange,
  onClearError,
}: WorkspacePreferencesStepProps) {
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
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2 text-left">
        <h2 className="font-display text-[1.5rem] leading-7 tracking-tight text-ink sm:text-[1.75rem] sm:leading-8">
          {t('step3.title')}
        </h2>
        <p className="text-sm leading-6 text-pretty text-body">{t('step3.subtitle')}</p>
      </div>

      <Field data-invalid={errors.defaultLanguage ? true : undefined} className="gap-2">
        <FieldLabel htmlFor={languageId} className="text-sm font-medium leading-5 text-ink">
          {t('step3.defaultLanguage')}
          <RequiredAsterisk />
        </FieldLabel>
        <select
          id={languageId}
          name="defaultLanguage"
          disabled={pending}
          value={state.defaultLanguage}
          aria-invalid={Boolean(errors.defaultLanguage)}
          aria-describedby={errors.defaultLanguage ? languageErrorId : undefined}
          className={selectClassName}
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
        </select>
        {errors.defaultLanguage ? (
          <FieldError id={languageErrorId} className="text-xs leading-4 text-negative">
            {errors.defaultLanguage}
          </FieldError>
        ) : null}
      </Field>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Field data-invalid={errors.dateFormat ? true : undefined} className="gap-2">
          <FieldLabel htmlFor={dateFormatId} className="text-sm font-medium leading-5 text-ink">
            {t('step3.dateFormat')}
            <RequiredAsterisk />
          </FieldLabel>
          <select
            id={dateFormatId}
            name="dateFormat"
            disabled={pending}
            value={state.dateFormat}
            aria-invalid={Boolean(errors.dateFormat)}
            aria-describedby={errors.dateFormat ? dateErrorId : undefined}
            className={selectClassName}
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
          </select>
          {errors.dateFormat ? (
            <FieldError id={dateErrorId} className="text-xs leading-4 text-negative">
              {errors.dateFormat}
            </FieldError>
          ) : null}
        </Field>

        <Field data-invalid={errors.timeFormat ? true : undefined} className="gap-2">
          <FieldLabel htmlFor={timeFormatId} className="text-sm font-medium leading-5 text-ink">
            {t('step3.timeFormat')}
            <RequiredAsterisk />
          </FieldLabel>
          <select
            id={timeFormatId}
            name="timeFormat"
            disabled={pending}
            value={state.timeFormat}
            aria-invalid={Boolean(errors.timeFormat)}
            aria-describedby={errors.timeFormat ? timeErrorId : undefined}
            className={selectClassName}
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
          </select>
          {errors.timeFormat ? (
            <FieldError id={timeErrorId} className="text-xs leading-4 text-negative">
              {errors.timeFormat}
            </FieldError>
          ) : null}
        </Field>
      </div>

      <Field data-invalid={errors.themePreference ? true : undefined} className="gap-2">
        <FieldLabel className="text-sm font-medium leading-5 text-ink">
          {t('step3.themePreference')}
          <RequiredAsterisk />
        </FieldLabel>
        <div
          id={themeId}
          role="radiogroup"
          aria-label={t('step3.themePreference')}
          className="grid grid-cols-1 gap-2 sm:grid-cols-3"
        >
          {THEME_PREFERENCE_OPTIONS.map((value) => {
            const selected = state.themePreference === value
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
                  'rounded-xl border px-3 py-2.5 text-left text-sm font-medium transition-colors duration-150',
                  selected
                    ? 'border-primary/50 bg-primary-pale text-positive-deep'
                    : 'border-[#E2E8F0] bg-canvas text-ink hover:border-[#CBD5E1] hover:bg-[#F8FAFC]'
                )}
              >
                {t(`step3.themes.${value}`)}
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

      <Field className="gap-2">
        <FieldLabel className="text-sm font-medium leading-5 text-ink">
          {t('step3.notifications')}
        </FieldLabel>
        <FieldDescription className="text-xs leading-4 text-mute">
          {t('step3.notificationsHint')}
        </FieldDescription>
        <div
          id={notificationsId}
          className="flex flex-col gap-2"
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
                    ? 'border-primary/40 bg-primary-pale/50'
                    : 'border-[#E2E8F0] bg-canvas hover:bg-[#F8FAFC]'
                )}
              >
                <input
                  id={optionId}
                  type="checkbox"
                  className="mt-0.5 size-4 rounded border-[#CBD5E1] text-primary focus-visible:ring-primary/30"
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
