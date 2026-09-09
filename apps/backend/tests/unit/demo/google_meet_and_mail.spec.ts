import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import { createGoogleMeetEvent } from '#services/google_meet_service'
import { buildDemoConfirmationEmail } from '#services/demo_booking_mail'

test.group('Google Meet service', () => {
  test('creates a calendar event and stores the real hangout URL', async ({ assert }) => {
    const calls: Array<{ url: string; init?: RequestInit }> = []
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input)
      calls.push({ url, init })
      if (url.includes('oauth2.googleapis.com/token')) {
        return Response.json({ access_token: 'ya29.test-token' })
      }
      return Response.json({
        id: 'event-123',
        hangoutLink: 'https://meet.google.com/abc-defg-hij',
      })
    }

    const start = DateTime.fromISO('2026-09-15T04:30:00.000Z')
    const result = await createGoogleMeetEvent(
      {
        summary: 'Whats-Auto product demo with Jane',
        description: 'Demo',
        start,
        end: start.plus({ minutes: 30 }),
        timeZone: 'Asia/Kolkata',
        attendeeEmail: 'jane@company.com',
        attendeeName: 'Jane',
      },
      fetchImpl
    )

    assert.equal(result.hangoutLink, 'https://meet.google.com/abc-defg-hij')
    assert.equal(result.calendarEventId, 'event-123')
    assert.isTrue(calls.some((call) => call.url.includes('conferenceDataVersion=1')))
    const eventBody = JSON.parse(String(calls[1]?.init?.body)) as {
      conferenceData: { createRequest: { conferenceSolutionKey: { type: string } } }
    }
    assert.equal(eventBody.conferenceData.createRequest.conferenceSolutionKey.type, 'hangoutsMeet')
  })

  test('does not invent a Meet URL when Calendar omits hangoutLink', async ({ assert }) => {
    const fetchImpl: typeof fetch = async (input) => {
      if (String(input).includes('oauth2.googleapis.com/token')) {
        return Response.json({ access_token: 'ya29.test-token' })
      }
      return Response.json({ id: 'event-no-meet' })
    }

    await assert.rejects(async () => {
      const start = DateTime.fromISO('2026-09-15T04:30:00.000Z')
      await createGoogleMeetEvent(
        {
          summary: 'Demo',
          description: 'Demo',
          start,
          end: start.plus({ minutes: 30 }),
          timeZone: 'Asia/Kolkata',
          attendeeEmail: 'jane@company.com',
          attendeeName: 'Jane',
        },
        fetchImpl
      )
    }, /did not return a Google Meet link/)
  })
})

test.group('Demo confirmation email', () => {
  test('includes date, timezone, and Meet link', ({ assert }) => {
    const start = DateTime.fromISO('2026-09-15T04:30:00.000Z')
    const email = buildDemoConfirmationEmail({
      to: 'jane@company.com',
      fullName: 'Jane Doe',
      startsAt: start,
      endsAt: start.plus({ minutes: 30 }),
      demoTimeZone: 'Asia/Kolkata',
      viewerTimeZone: 'America/New_York',
      meetingUrl: 'https://meet.google.com/abc-defg-hij',
    })

    assert.include(email.subject, 'Asia/Kolkata')
    assert.include(email.text, 'Jane Doe')
    assert.include(email.text, 'Asia/Kolkata')
    assert.include(email.text, 'America/New_York')
    assert.include(email.text, 'https://meet.google.com/abc-defg-hij')
    assert.include(email.html, 'https://meet.google.com/abc-defg-hij')
    assert.include(email.html, 'Asia/Kolkata')
  })
})
