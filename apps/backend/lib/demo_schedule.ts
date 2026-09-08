import { DateTime } from 'luxon'
import env from '#start/env'
import { isValidIanaTimeZone } from '#lib/scheduled_at'

export const DEMO_BOOKINGS_CONFIRMED_SLOT_INDEX = 'demo_bookings_confirmed_starts_at_unique'

export const DEFAULT_DEMO_TIMEZONE = 'Asia/Kolkata'
export const DEFAULT_DEMO_SLOT_TIMES = '10:00,11:00,14:00,15:30,17:00'
export const DEFAULT_DEMO_WEEKDAYS = '1,2,3,4,5'
export const DEFAULT_DEMO_DURATION_MINUTES = 30
export const DEFAULT_DEMO_HORIZON_DAYS = 60

export type DemoSlotTime = { hour: number; minute: number }

export type DemoScheduleConfig = {
  timeZone: string
  durationMinutes: number
  slotTimes: DemoSlotTime[]
  weekdays: number[]
  horizonDays: number
}

export type OfferedDemoSlot = {
  id: string
  start: DateTime
  end: DateTime
  label: string
}

function parseSlotTimes(raw: string | undefined): DemoSlotTime[] {
  const source = (raw ?? DEFAULT_DEMO_SLOT_TIMES).trim() || DEFAULT_DEMO_SLOT_TIMES
  const times: DemoSlotTime[] = []
  for (const part of source.split(',')) {
    const match = part.trim().match(/^(\d{1,2}):(\d{2})$/)
    if (!match) continue
    const hour = Number(match[1])
    const minute = Number(match[2])
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) continue
    times.push({ hour, minute })
  }
  return times.length > 0 ? times : parseSlotTimes(DEFAULT_DEMO_SLOT_TIMES)
}

function parseWeekdays(raw: string | undefined): number[] {
  const source = (raw ?? DEFAULT_DEMO_WEEKDAYS).trim() || DEFAULT_DEMO_WEEKDAYS
  const days = source
    .split(',')
    .map((part) => Number(part.trim()))
    .filter((day) => Number.isInteger(day) && day >= 1 && day <= 7)
  return days.length > 0 ? [...new Set(days)] : [1, 2, 3, 4, 5]
}

export function getDemoScheduleConfig(): DemoScheduleConfig {
  const timeZoneRaw = env.get('DEMO_TIMEZONE', DEFAULT_DEMO_TIMEZONE).trim()
  const timeZone = isValidIanaTimeZone(timeZoneRaw) ? timeZoneRaw : DEFAULT_DEMO_TIMEZONE

  const duration = env.get('DEMO_DURATION_MINUTES', DEFAULT_DEMO_DURATION_MINUTES)
  const horizon = env.get('DEMO_BOOKING_HORIZON_DAYS', DEFAULT_DEMO_HORIZON_DAYS)

  return {
    timeZone,
    durationMinutes: duration > 0 ? duration : DEFAULT_DEMO_DURATION_MINUTES,
    slotTimes: parseSlotTimes(env.get('DEMO_SLOT_TIMES')),
    weekdays: parseWeekdays(env.get('DEMO_WEEKDAYS')),
    horizonDays: horizon > 0 ? horizon : DEFAULT_DEMO_HORIZON_DAYS,
  }
}

export function isValidCivilDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && DateTime.fromISO(value, { zone: 'UTC' }).isValid
}

export function formatSlotLabel(start: DateTime): string {
  return start.toFormat('h:mm a')
}

/**
 * Offered demo slots for a civil date in the platform demo timezone.
 * Does not consult bookings — the caller subtracts taken slots.
 */
export function listOfferedSlotsForDate(
  date: string,
  config: DemoScheduleConfig = getDemoScheduleConfig(),
  now: DateTime = DateTime.utc()
): OfferedDemoSlot[] {
  if (!isValidCivilDate(date)) return []

  const day = DateTime.fromISO(date, { zone: config.timeZone }).startOf('day')
  if (!day.isValid) return []

  const today = now.setZone(config.timeZone).startOf('day')
  if (day < today) return []

  const lastBookable = today.plus({ days: config.horizonDays })
  if (day > lastBookable) return []

  if (!config.weekdays.includes(day.weekday)) return []

  const slots: OfferedDemoSlot[] = []
  for (const time of config.slotTimes) {
    const start = day.set({ hour: time.hour, minute: time.minute, second: 0, millisecond: 0 })
    if (!start.isValid) continue
    if (start.toUTC() <= now.toUTC()) continue

    const end = start.plus({ minutes: config.durationMinutes })
    const id = start.toUTC().toISO()
    if (!id) continue

    slots.push({
      id,
      start,
      end,
      label: formatSlotLabel(start),
    })
  }

  return slots
}

export function findOfferedSlotById(
  slotId: string,
  config: DemoScheduleConfig = getDemoScheduleConfig(),
  now: DateTime = DateTime.utc()
): OfferedDemoSlot | null {
  const instant = DateTime.fromISO(slotId, { setZone: true })
  if (!instant.isValid) return null

  const date = instant.setZone(config.timeZone).toISODate()
  if (!date) return null

  return (
    listOfferedSlotsForDate(date, config, now).find(
      (slot) => slot.start.toUTC().toMillis() === instant.toUTC().toMillis()
    ) ?? null
  )
}
