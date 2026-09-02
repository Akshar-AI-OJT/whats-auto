'use client'

import { useMemo, useState, type FormEvent } from 'react'
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Video,
} from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { buttonVariants } from '@/components/ui/button'
import { featuresPrimaryBtn } from '@/components/features/page/features-styles'
import { cn } from '@/lib/utils'
import { BookDemoSuccess } from './BookDemoSuccess'

const MOCK_SLOTS = [
  '10:00 AM',
  '11:00 AM',
  '2:00 PM',
  '3:30 PM',
  '5:00 PM',
] as const

const COMPANY_SIZES = ['1-10', '11-50', '51-200', '200+'] as const

const PURPOSE_KEYS = [
  'overview',
  'collaboration',
  'ai',
  'enterprise',
  'other',
] as const

const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const

type FormState = {
  fullName: string
  email: string
  company: string
  phone: string
  companySize: string
  purpose: string
  privacy: boolean
}

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

function daysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate()
}

function fieldClassName(invalid?: boolean) {
  return cn(
    'h-11 w-full rounded-xl border bg-[#F8FAFC]/90 px-3.5 text-sm text-ink outline-none',
    'placeholder:text-mute',
    'transition-[border-color,box-shadow,background-color] duration-200',
    'hover:border-[#CBD5E1]',
    'focus-visible:border-primary/55 focus-visible:bg-canvas focus-visible:ring-2 focus-visible:ring-primary/30',
    invalid
      ? 'border-negative ring-2 ring-negative/20'
      : 'border-[#E2E8F0]'
  )
}

export function BookDemoBookingPanel() {
  const t = useTranslations('bookDemoPage.booking')
  const locale = useLocale()
  const today = useMemo(() => startOfDay(new Date()), [])

  const [viewYear, setViewYear] = useState(today.getFullYear())
  const [viewMonth, setViewMonth] = useState(today.getMonth())
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>({
    fullName: '',
    email: '',
    company: '',
    phone: '',
    companySize: '',
    purpose: '',
    privacy: false,
  })
  const [touched, setTouched] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const monthLabel = useMemo(
    () =>
      new Date(viewYear, viewMonth, 1).toLocaleDateString(locale, {
        month: 'long',
        year: 'numeric',
      }),
    [locale, viewMonth, viewYear]
  )

  const formattedDate = selectedDate
    ? selectedDate.toLocaleDateString(locale, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : t('summary.pending')

  const calendarCells = useMemo(() => {
    const firstDow = new Date(viewYear, viewMonth, 1).getDay()
    const total = daysInMonth(viewYear, viewMonth)
    const cells: Array<{ date: Date | null; key: string }> = []

    for (let i = 0; i < firstDow; i++) {
      cells.push({ date: null, key: `pad-${i}` })
    }
    for (let day = 1; day <= total; day++) {
      cells.push({
        date: new Date(viewYear, viewMonth, day),
        key: `d-${viewYear}-${viewMonth}-${day}`,
      })
    }
    return cells
  }, [viewMonth, viewYear])

  const canGoPrev =
    viewYear > today.getFullYear() ||
    (viewYear === today.getFullYear() && viewMonth > today.getMonth())

  function goPrevMonth() {
    if (!canGoPrev) return
    if (viewMonth === 0) {
      setViewMonth(11)
      setViewYear((y) => y - 1)
    } else {
      setViewMonth((m) => m - 1)
    }
  }

  function goNextMonth() {
    if (viewMonth === 11) {
      setViewMonth(0)
      setViewYear((y) => y + 1)
    } else {
      setViewMonth((m) => m + 1)
    }
  }

  function selectDate(date: Date) {
    if (startOfDay(date) < today) return
    setSelectedDate(date)
    setSelectedSlot(null)
    setSubmitted(false)
  }

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
    setSubmitted(false)
  }

  const errors = {
    fullName: touched && !form.fullName.trim(),
    email:
      touched &&
      (!form.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())),
    privacy: touched && !form.privacy,
    date: touched && !selectedDate,
    slot: touched && !selectedSlot,
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setTouched(true)
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())
    if (
      !form.fullName.trim() ||
      !emailOk ||
      !form.privacy ||
      !selectedDate ||
      !selectedSlot
    ) {
      return
    }
    // Frontend-only: simulate successful booking (no API).
    setSubmitted(true)
    requestAnimationFrame(() => {
      document
        .getElementById('booking')
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  function resetBooking() {
    setSelectedDate(null)
    setSelectedSlot(null)
    setForm({
      fullName: '',
      email: '',
      company: '',
      phone: '',
      companySize: '',
      purpose: '',
      privacy: false,
    })
    setTouched(false)
    setSubmitted(false)
  }

  if (submitted && selectedDate && selectedSlot) {
    return (
      <BookDemoSuccess
        dateLabel={formattedDate}
        timeLabel={selectedSlot}
        onBookAnother={resetBooking}
      />
    )
  }

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 lg:gap-6 xl:gap-8">
      {/* Left — calendar & slots */}
      <article
        className={cn(
          'rounded-3xl border border-[#E2E8F0] bg-canvas/90 p-6 backdrop-blur-sm sm:p-7 md:p-8',
          'shadow-[0_1px_2px_rgb(15_23_42/0.04),0_12px_32px_rgb(15_23_42/0.05)]'
        )}
      >
        <h2 className="font-display text-xl leading-snug tracking-tight text-ink sm:text-2xl">
          {t('scheduleTitle')}
        </h2>
        <p className="mt-2 text-sm leading-6 text-body">{t('scheduleHint')}</p>

        <div className="mt-6 space-y-6">
          <div className="space-y-3">
            <p className="text-sm font-medium text-ink">{t('calendarLabel')}</p>
            <div
              className={cn(
                'rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC]/80 p-4 sm:p-5',
                errors.date && 'ring-2 ring-negative/20'
              )}
            >
              <div className="mb-4 flex items-center justify-between gap-3">
                <p className="text-sm font-semibold tracking-tight text-ink capitalize">
                  {monthLabel}
                </p>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={goPrevMonth}
                    disabled={!canGoPrev}
                    aria-label={t('prevMonth')}
                    className={cn(
                      'inline-flex size-8 items-center justify-center rounded-lg border border-[#E2E8F0] bg-canvas text-body',
                      'transition-[background-color,border-color,transform] duration-200',
                      'hover:border-[#CBD5E1] hover:bg-canvas enabled:hover:-translate-y-0.5',
                      'disabled:cursor-not-allowed disabled:opacity-40'
                    )}
                  >
                    <ChevronLeft className="size-4" aria-hidden />
                  </button>
                  <button
                    type="button"
                    onClick={goNextMonth}
                    aria-label={t('nextMonth')}
                    className={cn(
                      'inline-flex size-8 items-center justify-center rounded-lg border border-[#E2E8F0] bg-canvas text-body',
                      'transition-[background-color,border-color,transform] duration-200',
                      'hover:-translate-y-0.5 hover:border-[#CBD5E1] hover:bg-canvas'
                    )}
                  >
                    <ChevronRight className="size-4" aria-hidden />
                  </button>
                </div>
              </div>

              <div className="mb-2 grid grid-cols-7 gap-1 sm:gap-1.5">
                {WEEKDAY_KEYS.map((key) => (
                  <span
                    key={key}
                    className="py-1 text-center text-[11px] font-semibold tracking-wide text-mute uppercase"
                  >
                    {t(`weekdays.${key}`)}
                  </span>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
                {calendarCells.map(({ date, key }) => {
                  if (!date) {
                    return <div key={key} className="aspect-square" />
                  }

                  const past = startOfDay(date) < today
                  const selected = selectedDate
                    ? isSameDay(date, selectedDate)
                    : false
                  const isToday = isSameDay(date, today)

                  return (
                    <button
                      key={key}
                      type="button"
                      disabled={past}
                      onClick={() => selectDate(date)}
                      aria-pressed={selected}
                      aria-label={date.toLocaleDateString(locale, {
                        month: 'long',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                      className={cn(
                        'aspect-square rounded-xl text-sm font-medium transition-[transform,background-color,box-shadow,color,border-color] duration-200',
                        past &&
                          'cursor-not-allowed text-mute/50 line-through decoration-mute/30',
                        !past &&
                          !selected &&
                          'text-ink hover:-translate-y-0.5 hover:bg-primary/15 hover:shadow-[0_0_0_3px_rgb(37_99_235/0.18)]',
                        !past && isToday && !selected && 'ring-1 ring-primary/40',
                        selected &&
                          'bg-primary text-on-primary shadow-[0_0_0_3px_rgb(37_99_235/0.28),0_8px_18px_rgb(37_99_235/0.35)] hover:bg-primary-active'
                      )}
                    >
                      {date.getDate()}
                    </button>
                  )
                })}
              </div>
            </div>
            {errors.date ? (
              <p className="text-xs font-medium text-negative">
                {t('errors.dateRequired')}
              </p>
            ) : null}
          </div>

          <div className="space-y-3">
            <p className="text-sm font-medium text-ink">{t('slotsLabel')}</p>
            <div className="flex flex-wrap gap-2.5">
              {MOCK_SLOTS.map((slot) => {
                const selected = selectedSlot === slot
                return (
                  <button
                    key={slot}
                    type="button"
                    onClick={() => {
                      setSelectedSlot(slot)
                      setSubmitted(false)
                    }}
                    aria-pressed={selected}
                    className={cn(
                      'min-w-[6.5rem] flex-1 rounded-xl border px-3.5 py-2.5 text-sm font-medium sm:flex-none',
                      'transition-[transform,background-color,border-color,box-shadow,color] duration-200',
                      selected
                        ? 'border-primary bg-primary text-on-primary shadow-[0_0_0_3px_rgb(37_99_235/0.22),0_8px_18px_rgb(37_99_235/0.3)]'
                        : 'border-[#E2E8F0] bg-canvas text-ink hover:-translate-y-0.5 hover:border-primary/50 hover:bg-primary-pale hover:shadow-[0_0_0_3px_rgb(37_99_235/0.14)]'
                    )}
                  >
                    {slot}
                  </button>
                )
              })}
            </div>
            {errors.slot ? (
              <p className="text-xs font-medium text-negative">
                {t('errors.slotRequired')}
              </p>
            ) : null}
          </div>
        </div>
      </article>

      {/* Right — form + summary */}
      <div className="flex flex-col gap-5 lg:gap-6">
        <article
          className={cn(
            'rounded-3xl border border-[#E2E8F0] bg-canvas/90 p-6 backdrop-blur-sm sm:p-7 md:p-8',
            'shadow-[0_1px_2px_rgb(15_23_42/0.04),0_12px_32px_rgb(15_23_42/0.05)]'
          )}
        >
          <h2 className="font-display text-xl leading-snug tracking-tight text-ink sm:text-2xl">
            {t('detailsTitle')}
          </h2>
          <p className="mt-2 text-sm leading-6 text-body">{t('detailsHint')}</p>

          <form className="mt-6 space-y-4" onSubmit={handleSubmit} noValidate>
            <div className="space-y-1.5">
              <label htmlFor="demo-full-name" className="text-sm font-medium text-ink">
                {t('fields.fullName')} <span className="text-negative">*</span>
              </label>
              <input
                id="demo-full-name"
                name="fullName"
                autoComplete="name"
                value={form.fullName}
                onChange={(e) => updateField('fullName', e.target.value)}
                placeholder={t('placeholders.fullName')}
                className={fieldClassName(errors.fullName)}
                aria-invalid={errors.fullName}
              />
              {errors.fullName ? (
                <p className="text-xs font-medium text-negative">
                  {t('errors.nameRequired')}
                </p>
              ) : null}
            </div>

            <div className="space-y-1.5">
              <label htmlFor="demo-email" className="text-sm font-medium text-ink">
                {t('fields.email')} <span className="text-negative">*</span>
              </label>
              <input
                id="demo-email"
                name="email"
                type="email"
                autoComplete="email"
                value={form.email}
                onChange={(e) => updateField('email', e.target.value)}
                placeholder={t('placeholders.email')}
                className={fieldClassName(errors.email)}
                aria-invalid={errors.email}
              />
              {errors.email ? (
                <p className="text-xs font-medium text-negative">
                  {t('errors.emailInvalid')}
                </p>
              ) : null}
            </div>

            <div className="space-y-1.5">
              <label htmlFor="demo-company" className="text-sm font-medium text-ink">
                {t('fields.company')}
              </label>
              <input
                id="demo-company"
                name="company"
                autoComplete="organization"
                value={form.company}
                onChange={(e) => updateField('company', e.target.value)}
                placeholder={t('placeholders.company')}
                className={fieldClassName()}
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="demo-phone" className="text-sm font-medium text-ink">
                {t('fields.phone')}
              </label>
              <input
                id="demo-phone"
                name="phone"
                type="tel"
                autoComplete="tel"
                value={form.phone}
                onChange={(e) => updateField('phone', e.target.value)}
                placeholder={t('placeholders.phone')}
                className={fieldClassName()}
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="demo-size" className="text-sm font-medium text-ink">
                {t('fields.companySize')}
              </label>
              <select
                id="demo-size"
                name="companySize"
                value={form.companySize}
                onChange={(e) => updateField('companySize', e.target.value)}
                className={cn(fieldClassName(), 'cursor-pointer appearance-none pr-9')}
                style={{
                  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' fill='none' viewBox='0 0 24 24' stroke='%64748B' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
                  backgroundRepeat: 'no-repeat',
                  backgroundPosition: 'right 0.75rem center',
                }}
              >
                <option value="">{t('placeholders.companySize')}</option>
                {COMPANY_SIZES.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="demo-purpose" className="text-sm font-medium text-ink">
                {t('fields.purpose')}
              </label>
              <select
                id="demo-purpose"
                name="purpose"
                value={form.purpose}
                onChange={(e) => updateField('purpose', e.target.value)}
                className={cn(fieldClassName(), 'cursor-pointer appearance-none pr-9')}
                style={{
                  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' fill='none' viewBox='0 0 24 24' stroke='%64748B' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
                  backgroundRepeat: 'no-repeat',
                  backgroundPosition: 'right 0.75rem center',
                }}
              >
                <option value="">{t('placeholders.purpose')}</option>
                {PURPOSE_KEYS.map((key) => (
                  <option key={key} value={key}>
                    {t(`purposeOptions.${key}`)}
                  </option>
                ))}
              </select>
            </div>

            <label
              className={cn(
                'flex cursor-pointer items-start gap-3 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC]/70 px-3.5 py-3',
                'transition-[border-color,background-color] duration-200 hover:border-[#CBD5E1]',
                errors.privacy && 'border-negative ring-2 ring-negative/20'
              )}
            >
              <input
                type="checkbox"
                checked={form.privacy}
                onChange={(e) => updateField('privacy', e.target.checked)}
                className="mt-0.5 size-4 shrink-0 rounded border-[#CBD5E1] text-positive-deep accent-[var(--primary,#2563eb)] focus-visible:ring-2 focus-visible:ring-primary/40"
              />
              <span className="text-sm leading-6 text-body">
                {t.rich('privacyAgree', {
                  privacy: (chunks) => (
                    <Link
                      href="/privacy"
                      className="font-semibold text-positive-deep underline-offset-2 hover:underline"
                    >
                      {chunks}
                    </Link>
                  ),
                })}
              </span>
            </label>
            {errors.privacy ? (
              <p className="text-xs font-medium text-negative">
                {t('errors.privacyRequired')}
              </p>
            ) : null}

            <button
              type="submit"
              className={cn(
                buttonVariants({ size: 'lg' }),
                featuresPrimaryBtn,
                'mt-2 w-full justify-center'
              )}
            >
              {t('cta')}
            </button>
          </form>
        </article>

        <aside
          className={cn(
            'rounded-3xl border border-[#E2E8F0] bg-canvas/90 p-6 backdrop-blur-sm sm:p-7',
            'shadow-[0_1px_2px_rgb(15_23_42/0.04),0_12px_32px_rgb(15_23_42/0.05)]'
          )}
        >
          <h3 className="font-display text-lg font-semibold tracking-tight text-ink">
            {t('summary.title')}
          </h3>

          <dl className="mt-4 space-y-3">
            {(
              [
                ['date', formattedDate],
                ['time', selectedSlot ?? t('summary.pending')],
                ['duration', t('summary.durationValue')],
                ['platform', t('summary.platformValue')],
                ['price', t('summary.priceValue')],
              ] as const
            ).map(([key, value]) => (
              <div
                key={key}
                className="flex items-center justify-between gap-3 border-b border-[#E2E8F0]/80 pb-3 last:border-0 last:pb-0"
              >
                <dt className="text-sm text-mute">{t(`summary.${key}`)}</dt>
                <dd
                  className={cn(
                    'text-sm font-semibold text-ink',
                    key === 'price' && 'text-positive-deep'
                  )}
                >
                  {value}
                </dd>
              </div>
            ))}
          </dl>

          <ul className="mt-5 space-y-2.5">
            {(
              [
                { key: 'invite', icon: Check },
                { key: 'meet', icon: Video },
                { key: 'reminder', icon: Clock3 },
              ] as const
            ).map(({ key, icon: Icon }) => (
              <li
                key={key}
                className="flex items-center gap-2.5 text-sm font-medium text-body"
              >
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary-pale text-positive-deep">
                  <Icon className="size-3.5" strokeWidth={2.5} aria-hidden />
                </span>
                {t(`summary.perks.${key}`)}
              </li>
            ))}
          </ul>

          <p className="mt-5 text-center text-sm leading-6 text-mute">
            {t('meetNote')}
          </p>
        </aside>
      </div>
    </div>
  )
}
