import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import logger from '@adonisjs/core/services/logger'
import DemoBookingException from '#exceptions/demo_booking_exception'
import { isPostgresUniqueViolation } from '#lib/pg_unique_violation'
import { isValidIanaTimeZone, toUtcIso } from '#lib/scheduled_at'
import {
  DEMO_BOOKINGS_CONFIRMED_SLOT_INDEX,
  findOfferedSlotById,
  getDemoScheduleConfig,
  isValidCivilDate,
  listOfferedSlotsForDate,
  type OfferedDemoSlot,
} from '#lib/demo_schedule'
import { sendDemoBookingConfirmationEmail } from '#services/demo_booking_mail'
import { googleMeetService, type GoogleMeetEventResult } from '#services/google_meet_service'

export type DemoAvailabilitySlot = {
  id: string
  startTime: string
  endTime: string
  label: string
  available: true
}

export type DemoAvailability = {
  date: string
  timeZone: string
  today: string
  durationMinutes: number
  slots: DemoAvailabilitySlot[]
}

export type CreateDemoBookingInput = {
  name: string
  email: string
  slotId: string
  timeZone: string
  company?: string | null
  phone?: string | null
  companySize?: string | null
  purpose?: string | null
}

export type DemoBookingRecord = {
  id: string
  fullName: string
  email: string
  company: string | null
  phone: string | null
  companySize: string | null
  purpose: string | null
  startsAt: string
  endsAt: string
  timeZone: string
  demoTimeZone: string
  status: string
  meetingUrl: string | null
  calendarEventId: string | null
  createdAt: string
}

export type DemoMeetingProvider = {
  isConfigured(): boolean
  createMeeting(input: {
    summary: string
    description: string
    start: DateTime
    end: DateTime
    timeZone: string
    attendeeEmail: string
    attendeeName: string
  }): Promise<GoogleMeetEventResult>
}

export type DemoConfirmationMailer = typeof sendDemoBookingConfirmationEmail

type DbClient = typeof db | TransactionClientContract

function mapBookingRow(row: Record<string, unknown>): DemoBookingRecord {
  return {
    id: row.id as string,
    fullName: row.fullName as string,
    email: row.email as string,
    company: (row.company as string | null) ?? null,
    phone: (row.phone as string | null) ?? null,
    companySize: (row.companySize as string | null) ?? null,
    purpose: (row.purpose as string | null) ?? null,
    startsAt: toUtcIso(row.startsAt as Date | string),
    endsAt: toUtcIso(row.endsAt as Date | string),
    timeZone: row.timeZone as string,
    demoTimeZone: row.demoTimeZone as string,
    status: row.status as string,
    meetingUrl: (row.meetingUrl as string | null) ?? null,
    calendarEventId: (row.calendarEventId as string | null) ?? null,
    createdAt: toUtcIso(row.createdAt as Date | string),
  }
}

function toAvailabilitySlot(slot: OfferedDemoSlot): DemoAvailabilitySlot {
  const startTime = slot.start.toUTC().toISO()
  const endTime = slot.end.toUTC().toISO()
  if (!startTime || !endTime) {
    throw DemoBookingException.invalidSlot()
  }
  return {
    id: slot.id,
    startTime,
    endTime,
    label: slot.label,
    available: true,
  }
}

export class DemoBookingService {
  constructor(
    private meeting: DemoMeetingProvider = googleMeetService,
    private mailer: DemoConfirmationMailer = sendDemoBookingConfirmationEmail
  ) {}

  async getAvailability(date: string, viewerTimeZone?: string): Promise<DemoAvailability> {
    if (!isValidCivilDate(date)) {
      throw DemoBookingException.invalidDate()
    }
    if (viewerTimeZone && !isValidIanaTimeZone(viewerTimeZone)) {
      throw DemoBookingException.invalidTimeZone()
    }

    const config = getDemoScheduleConfig()
    const now = DateTime.utc()
    const offered = listOfferedSlotsForDate(date, config, now)
    const booked = await this.listBookedStartIsos(offered)

    return {
      date,
      timeZone: config.timeZone,
      today: now.setZone(config.timeZone).toISODate() ?? date,
      durationMinutes: config.durationMinutes,
      slots: offered.filter((slot) => !booked.has(slot.id)).map(toAvailabilitySlot),
    }
  }

  async createBooking(input: CreateDemoBookingInput): Promise<DemoBookingRecord> {
    if (!isValidIanaTimeZone(input.timeZone)) {
      throw DemoBookingException.invalidTimeZone()
    }

    const config = getDemoScheduleConfig()
    const offered = findOfferedSlotById(input.slotId, config)
    if (!offered) {
      throw DemoBookingException.invalidSlot()
    }

    const booking = await this.insertConfirmedBooking(input, offered, config.timeZone)
    const withMeeting = await this.attachGoogleMeet(booking, offered, config.timeZone)
    await this.sendConfirmation(withMeeting, offered)

    return withMeeting
  }

  private async listBookedStartIsos(offered: OfferedDemoSlot[]): Promise<Set<string>> {
    if (offered.length === 0) return new Set()

    const rangeStart = offered[0].start.toUTC().toJSDate()
    const rangeEnd = offered[offered.length - 1].end.toUTC().toJSDate()

    const rows = await db
      .from('demo_bookings')
      .where('status', 'confirmed')
      .where('startsAt', '>=', rangeStart)
      .where('startsAt', '<', rangeEnd)
      .select('startsAt')

    return new Set(rows.map((row) => toUtcIso(row.startsAt as Date | string)))
  }

  private async insertConfirmedBooking(
    input: CreateDemoBookingInput,
    offered: OfferedDemoSlot,
    demoTimeZone: string
  ): Promise<DemoBookingRecord> {
    try {
      return await db.transaction(async (trx) => {
        await this.lockSlot(trx, offered.id)

        const existing = await trx
          .from('demo_bookings')
          .where('status', 'confirmed')
          .where('startsAt', offered.start.toUTC().toJSDate())
          .first()

        if (existing) {
          throw DemoBookingException.slotUnavailable()
        }

        const [row] = await trx
          .table('demo_bookings')
          .insert({
            fullName: input.name,
            email: input.email,
            company: input.company?.trim() || null,
            phone: input.phone?.trim() || null,
            companySize: input.companySize?.trim() || null,
            purpose: input.purpose?.trim() || null,
            startsAt: offered.start.toUTC().toJSDate(),
            endsAt: offered.end.toUTC().toJSDate(),
            timeZone: input.timeZone,
            demoTimeZone,
            status: 'confirmed',
          })
          .returning([
            'id',
            'fullName',
            'email',
            'company',
            'phone',
            'companySize',
            'purpose',
            'startsAt',
            'endsAt',
            'timeZone',
            'demoTimeZone',
            'status',
            'meetingUrl',
            'calendarEventId',
            'createdAt',
          ])

        return mapBookingRow(row as Record<string, unknown>)
      })
    } catch (error) {
      if (error instanceof DemoBookingException) throw error
      if (isPostgresUniqueViolation(error, DEMO_BOOKINGS_CONFIRMED_SLOT_INDEX)) {
        throw DemoBookingException.slotUnavailable()
      }
      throw error
    }
  }

  private async lockSlot(trx: DbClient, slotId: string) {
    await trx.rawQuery('SELECT pg_advisory_xact_lock(hashtext(?))', [`demo-slot:${slotId}`])
  }

  private async attachGoogleMeet(
    booking: DemoBookingRecord,
    offered: OfferedDemoSlot,
    demoTimeZone: string
  ): Promise<DemoBookingRecord> {
    if (!this.meeting.isConfigured()) {
      logger.warn({ bookingId: booking.id }, 'demo.booking.meet_skipped_not_configured')
      return booking
    }

    try {
      const meeting = await this.meeting.createMeeting({
        summary: `Whats-Auto product demo with ${booking.fullName}`,
        description: [
          'Whats-Auto product demo (30 minutes).',
          `Guest: ${booking.fullName} <${booking.email}>`,
          booking.company ? `Company: ${booking.company}` : null,
        ]
          .filter(Boolean)
          .join('\n'),
        start: offered.start,
        end: offered.end,
        timeZone: demoTimeZone,
        attendeeEmail: booking.email,
        attendeeName: booking.fullName,
      })

      const [row] = await db
        .from('demo_bookings')
        .where('id', booking.id)
        .update({
          meetingUrl: meeting.hangoutLink,
          calendarEventId: meeting.calendarEventId,
          updatedAt: new Date(),
        })
        .returning([
          'id',
          'fullName',
          'email',
          'company',
          'phone',
          'companySize',
          'purpose',
          'startsAt',
          'endsAt',
          'timeZone',
          'demoTimeZone',
          'status',
          'meetingUrl',
          'calendarEventId',
          'createdAt',
        ])

      return mapBookingRow(row as Record<string, unknown>)
    } catch (error) {
      logger.error({ err: error, bookingId: booking.id }, 'demo.booking.meet_create_failed')
      return booking
    }
  }

  private async sendConfirmation(booking: DemoBookingRecord, offered: OfferedDemoSlot) {
    try {
      await this.mailer({
        to: booking.email,
        fullName: booking.fullName,
        startsAt: offered.start,
        endsAt: offered.end,
        demoTimeZone: booking.demoTimeZone,
        viewerTimeZone: booking.timeZone,
        meetingUrl: booking.meetingUrl,
      })
    } catch (error) {
      logger.error({ err: error, bookingId: booking.id }, 'demo.booking.confirmation_email_failed')
    }
  }
}
