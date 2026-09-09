import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import { DemoBookingService } from '#services/demo_booking_service'
import { getDemoScheduleConfig, listOfferedSlotsForDate } from '#lib/demo_schedule'

const MEET_URL = 'https://meet.google.com/abc-defg-hij'

function nextOpenDate() {
  const config = getDemoScheduleConfig()
  const now = DateTime.utc()
  for (let i = 1; i <= 14; i++) {
    const date = now.setZone(config.timeZone).startOf('day').plus({ days: i }).toISODate()
    if (!date) continue
    if (listOfferedSlotsForDate(date, config, now).length > 0) return date
  }
  throw new Error('No upcoming demo weekday with offered slots')
}

function nextClosedDate() {
  const config = getDemoScheduleConfig()
  let day = DateTime.utc().setZone(config.timeZone).startOf('day').plus({ days: 1 })
  for (let i = 0; i < 14; i++) {
    if (!config.weekdays.includes(day.weekday)) {
      const date = day.toISODate()
      if (date) return date
    }
    day = day.plus({ days: 1 })
  }
  throw new Error('No upcoming closed demo date')
}

async function cleanup(email: string) {
  await db.from('demo_bookings').where('email', email).delete()
}

async function nextFreeSlot() {
  const reader = new DemoBookingService()
  const date = nextOpenDate()
  const availability = await reader.getAvailability(date)
  const slot = availability.slots[0]
  if (!slot) {
    throw new Error(`No unbooked demo slots on ${date}`)
  }
  return { date, slot }
}

test.group('Demo bookings HTTP', (group) => {
  group.teardown(async () => {
    await db.from('demo_bookings').where('email', 'like', 'demo-test-%@example.com').delete()
  })

  test('availability returns real unbooked slots for a weekday', async ({ client, assert }) => {
    const date = nextOpenDate()
    const response = await client.get('/api/v1/demo/availability').qs({ date })

    response.assertStatus(200)
    const body = response.body() as {
      date: string
      timeZone: string
      slots: Array<{ id: string; startTime: string; available: boolean }>
    }
    assert.equal(body.date, date)
    assert.isString(body.timeZone)
    assert.isAtLeast(body.slots.length, 1)
    assert.isTrue(body.slots.every((slot) => slot.available === true))
    assert.isTrue(body.slots.every((slot) => slot.id.endsWith('Z')))
  })

  test('date with no slots returns empty availability', async ({ client, assert }) => {
    const date = nextClosedDate()
    const response = await client.get('/api/v1/demo/availability').qs({ date })

    response.assertStatus(200)
    const body = response.body() as { slots: unknown[] }
    assert.deepEqual(body.slots, [])
  })

  test('invalid date is rejected', async ({ client, assert }) => {
    const response = await client.get('/api/v1/demo/availability').qs({ date: '09-15-2026' })
    assert.isTrue([422, 400].includes(response.status()))
  })

  test('booking an available slot succeeds and is persisted', async ({ client, assert }) => {
    const email = `demo-test-${Date.now()}@example.com`
    const date = nextOpenDate()
    const availability = await client.get('/api/v1/demo/availability').qs({ date })
    const slot = (availability.body() as { slots: Array<{ id: string }> }).slots[0]

    const response = await client.post('/api/v1/demo/bookings').json({
      name: 'Jane Doe',
      email,
      slotId: slot.id,
      timeZone: 'Asia/Kolkata',
      company: 'Acme',
      purpose: 'overview',
    })

    response.assertStatus(201)
    const body = response.body() as {
      id: string
      email: string
      status: string
      startsAt: string
      timeZone: string
    }
    assert.equal(body.email, email)
    assert.equal(body.status, 'confirmed')
    assert.equal(body.startsAt, slot.id)
    assert.equal(body.timeZone, 'Asia/Kolkata')

    const row = await db.from('demo_bookings').where('id', body.id).first()
    assert.exists(row)
    assert.equal(row?.email, email)
    assert.equal(row?.status, 'confirmed')
    await cleanup(email)
  })

  test('invalid email is rejected', async ({ client, assert }) => {
    const date = nextOpenDate()
    const availability = await client.get('/api/v1/demo/availability').qs({ date })
    const slot = (availability.body() as { slots: Array<{ id: string }> }).slots[0]

    const response = await client.post('/api/v1/demo/bookings').json({
      name: 'Jane Doe',
      email: 'not-an-email',
      slotId: slot.id,
      timeZone: 'Asia/Kolkata',
    })

    assert.isTrue([422, 400].includes(response.status()))
  })

  test('invalid slot id is rejected', async ({ client, assert }) => {
    const response = await client.post('/api/v1/demo/bookings').json({
      name: 'Jane Doe',
      email: 'demo-test-invalid-slot@example.com',
      slotId: 'not-a-slot',
      timeZone: 'Asia/Kolkata',
    })

    assert.isTrue([422, 400, 409].includes(response.status()))
  })

  test('booking an unavailable slot fails', async ({ client, assert }) => {
    const emailA = `demo-test-unavail-a-${Date.now()}@example.com`
    const emailB = `demo-test-unavail-b-${Date.now()}@example.com`
    const date = nextOpenDate()
    const availability = await client.get('/api/v1/demo/availability').qs({ date })
    const slot = (availability.body() as { slots: Array<{ id: string }> }).slots[0]

    const first = await client.post('/api/v1/demo/bookings').json({
      name: 'User A',
      email: emailA,
      slotId: slot.id,
      timeZone: 'Asia/Kolkata',
    })
    first.assertStatus(201)

    const second = await client.post('/api/v1/demo/bookings').json({
      name: 'User B',
      email: emailB,
      slotId: slot.id,
      timeZone: 'Asia/Kolkata',
    })
    second.assertStatus(409)
    assert.equal((second.body() as { code?: string }).code, 'E_DEMO_SLOT_UNAVAILABLE')

    await cleanup(emailA)
    await cleanup(emailB)
  })

  test('the same slot cannot be double-booked concurrently', async ({ client, assert }) => {
    const date = nextOpenDate()
    const availability = await client.get('/api/v1/demo/availability').qs({ date })
    const slot = (availability.body() as { slots: Array<{ id: string }> }).slots.at(-1)
    assert.exists(slot)

    const emailA = `demo-test-race-a-${Date.now()}@example.com`
    const emailB = `demo-test-race-b-${Date.now()}@example.com`

    const [first, second] = await Promise.all([
      client.post('/api/v1/demo/bookings').json({
        name: 'Racer A',
        email: emailA,
        slotId: slot!.id,
        timeZone: 'Asia/Kolkata',
      }),
      client.post('/api/v1/demo/bookings').json({
        name: 'Racer B',
        email: emailB,
        slotId: slot!.id,
        timeZone: 'Asia/Kolkata',
      }),
    ])

    const statuses = [first.status(), second.status()].sort()
    assert.deepEqual(statuses, [201, 409])

    const rows = await db.from('demo_bookings').whereIn('email', [emailA, emailB]).select('id')
    assert.lengthOf(rows, 1)

    await cleanup(emailA)
    await cleanup(emailB)
  })
})

test.group('Demo booking service', () => {
  test('stores a Google Meet link from the meeting provider and sends confirmation email', async ({
    assert,
  }) => {
    const email = `demo-test-meet-${Date.now()}@example.com`
    const { slot } = await nextFreeSlot()
    const mailed: unknown[] = []

    const service = new DemoBookingService(
      {
        isConfigured: () => true,
        createMeeting: async () => ({
          hangoutLink: MEET_URL,
          calendarEventId: 'cal-event-1',
        }),
      },
      async (payload) => {
        mailed.push(payload)
      }
    )

    try {
      const booking = await service.createBooking({
        name: 'Priya Kapoor',
        email,
        slotId: slot.id,
        timeZone: 'America/New_York',
      })

      assert.equal(booking.meetingUrl, MEET_URL)
      assert.equal(booking.calendarEventId, 'cal-event-1')
      assert.lengthOf(mailed, 1)
      assert.equal((mailed[0] as { meetingUrl: string | null }).meetingUrl, MEET_URL)

      const row = await db.from('demo_bookings').where('id', booking.id).first()
      assert.equal(row?.meetingUrl, MEET_URL)
    } finally {
      await cleanup(email)
    }
  })

  test('does not store a fake Meet URL when Google Calendar is not configured', async ({
    assert,
  }) => {
    const email = `demo-test-nomeet-${Date.now()}@example.com`
    const { slot } = await nextFreeSlot()
    const mailed: unknown[] = []

    const service = new DemoBookingService(
      {
        isConfigured: () => false,
        createMeeting: async () => {
          throw new Error('should not be called')
        },
      },
      async (payload) => {
        mailed.push(payload)
      }
    )

    try {
      const booking = await service.createBooking({
        name: 'No Meet',
        email,
        slotId: slot.id,
        timeZone: 'Asia/Kolkata',
      })

      assert.isNull(booking.meetingUrl)
      assert.lengthOf(mailed, 1)
      assert.isNull((mailed[0] as { meetingUrl: string | null }).meetingUrl)
    } finally {
      await cleanup(email)
    }
  })
})
