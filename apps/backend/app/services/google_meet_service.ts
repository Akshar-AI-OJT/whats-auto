import env from '#start/env'
import type { DateTime } from 'luxon'

export type GoogleMeetEventInput = {
  summary: string
  description: string
  start: DateTime
  end: DateTime
  timeZone: string
  attendeeEmail: string
  attendeeName: string
}

export type GoogleMeetEventResult = {
  hangoutLink: string
  calendarEventId: string
}

type TokenResponse = {
  access_token?: string
  error?: string
  error_description?: string
}

type CalendarEventResponse = {
  id?: string
  hangoutLink?: string
  conferenceData?: {
    entryPoints?: Array<{ entryPointType?: string; uri?: string }>
  }
  error?: { message?: string }
}

function readOptionalSecret(
  name: 'GOOGLE_CALENDAR_REFRESH_TOKEN' | 'GOOGLE_CLIENT_SECRET'
): string {
  try {
    const value = env.get(name)
    if (!value) return ''
    return typeof value === 'string' ? value : value.release()
  } catch {
    return ''
  }
}

export function isGoogleMeetConfigured(): boolean {
  const refreshToken = readOptionalSecret('GOOGLE_CALENDAR_REFRESH_TOKEN').trim()
  const clientId = String(env.get('GOOGLE_CLIENT_ID') ?? '').trim()
  const clientSecret = readOptionalSecret('GOOGLE_CLIENT_SECRET').trim()
  return Boolean(refreshToken && clientId && clientSecret)
}

function extractMeetUrl(payload: CalendarEventResponse): string | null {
  if (
    typeof payload.hangoutLink === 'string' &&
    payload.hangoutLink.startsWith('https://meet.google.com/')
  ) {
    return payload.hangoutLink
  }

  const meetEntry = payload.conferenceData?.entryPoints?.find(
    (entry) => entry.entryPointType === 'video' && typeof entry.uri === 'string'
  )
  if (meetEntry?.uri?.startsWith('https://meet.google.com/')) {
    return meetEntry.uri
  }

  return null
}

async function getAccessToken(fetchImpl: typeof fetch): Promise<string> {
  const body = new URLSearchParams({
    client_id: env.get('GOOGLE_CLIENT_ID'),
    client_secret: readOptionalSecret('GOOGLE_CLIENT_SECRET'),
    refresh_token: readOptionalSecret('GOOGLE_CALENDAR_REFRESH_TOKEN'),
    grant_type: 'refresh_token',
  })

  const response = await fetchImpl('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })

  const payload = (await response.json()) as TokenResponse
  if (!response.ok || !payload.access_token) {
    throw new Error(
      payload.error_description || payload.error || 'Google OAuth token exchange failed'
    )
  }

  return payload.access_token
}

/**
 * Creates a Google Calendar event with a Google Meet conference.
 * Returns only a real hangout URL from Calendar API — never invents a Meet link.
 */
export async function createGoogleMeetEvent(
  input: GoogleMeetEventInput,
  fetchImpl: typeof fetch = fetch
): Promise<GoogleMeetEventResult> {
  const accessToken = await getAccessToken(fetchImpl)
  const calendarId = encodeURIComponent(env.get('GOOGLE_CALENDAR_ID', 'primary'))
  const requestId = crypto.randomUUID()

  const response = await fetchImpl(
    `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events?conferenceDataVersion=1&sendUpdates=all`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        summary: input.summary,
        description: input.description,
        start: {
          dateTime: input.start.setZone(input.timeZone).toISO({ suppressMilliseconds: true }),
          timeZone: input.timeZone,
        },
        end: {
          dateTime: input.end.setZone(input.timeZone).toISO({ suppressMilliseconds: true }),
          timeZone: input.timeZone,
        },
        attendees: [{ email: input.attendeeEmail, displayName: input.attendeeName }],
        conferenceData: {
          createRequest: {
            requestId,
            conferenceSolutionKey: { type: 'hangoutsMeet' },
          },
        },
      }),
    }
  )

  const payload = (await response.json()) as CalendarEventResponse
  if (!response.ok) {
    throw new Error(payload.error?.message || `Google Calendar API returned ${response.status}`)
  }

  const hangoutLink = extractMeetUrl(payload)
  if (!hangoutLink || !payload.id) {
    throw new Error('Google Calendar did not return a Google Meet link')
  }

  return { hangoutLink, calendarEventId: payload.id }
}

export const googleMeetService = {
  isConfigured: isGoogleMeetConfigured,
  createMeeting: createGoogleMeetEvent,
}
