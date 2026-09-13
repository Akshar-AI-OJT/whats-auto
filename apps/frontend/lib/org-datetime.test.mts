import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  formatCampaignScheduledAt,
  formatTimeZoneAbbreviation,
  isCampaignScheduleInFuture,
  isoInstantToDateTimeLocal,
  toCampaignScheduledAtPayload,
} from './org-datetime.ts'

const KOLKATA = 'Asia/Kolkata'

describe('campaign schedule timezone conversion', () => {
  it('converts organization wall clock to a UTC Z instant (IST 9:46 PM → 16:16Z)', () => {
    assert.equal(
      toCampaignScheduledAtPayload('2026-09-13T21:46', KOLKATA),
      '2026-09-13T16:16:00.000Z'
    )
  })

  it('keeps an already-UTC Z payload as the same instant', () => {
    assert.equal(
      toCampaignScheduledAtPayload('2026-09-13T16:16:00.000Z', KOLKATA),
      '2026-09-13T16:16:00.000Z'
    )
  })

  it('treats UTC organization wall clock as UTC', () => {
    assert.equal(
      toCampaignScheduledAtPayload('2026-09-13T16:00', 'UTC'),
      '2026-09-13T16:00:00.000Z'
    )
  })

  it('fills datetime-local from a UTC instant using organization wall clock', () => {
    assert.equal(
      isoInstantToDateTimeLocal('2026-09-13T16:16:00.000Z', KOLKATA),
      '2026-09-13T21:46'
    )
  })

  it('displays createdAt UTC instants in the organization timezone', () => {
    assert.equal(
      formatCampaignScheduledAt('2026-09-13T16:14:00.000Z', KOLKATA, 'en-US'),
      'Sep 13, 2026, 9:44 PM'
    )
  })

  it('labels Asia/Kolkata with a local name, not UTC', () => {
    const label = formatTimeZoneAbbreviation(KOLKATA)
    assert.notEqual(label, 'UTC')
    assert.match(label, /IST|India Time|GMT\+5:30/i)
  })

  it('treats a local wall clock that is still in the future in UTC as past when due in org time', () => {
    const now = Date.now()
    const pastLocalIso = new Date(now - 60_000).toISOString()
    const kolkataLocal = isoInstantToDateTimeLocal(pastLocalIso, KOLKATA)
    assert.equal(isCampaignScheduleInFuture(kolkataLocal, KOLKATA), false)
  })
})
