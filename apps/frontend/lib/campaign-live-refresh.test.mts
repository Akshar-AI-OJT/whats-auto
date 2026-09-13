import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  CAMPAIGN_IN_FLIGHT_REFETCH_MS,
  CAMPAIGN_RECEIPT_REFETCH_MS,
  campaignLiveRefreshMode,
  campaignQueryRefetchInterval,
  campaignQueryStaleTime,
  campaignsLiveRefreshMode,
} from './campaign-live-refresh.ts'

const NOW = Date.parse('2026-09-13T12:00:00.000Z')

describe('campaign live refresh', () => {
  it('polls sending and scheduled campaigns every 2s', () => {
    assert.equal(
      campaignLiveRefreshMode(
        {
          status: 'sending',
          sentCount: 0,
          failedCount: 0,
          deliveredCount: 0,
          totalRecipients: 10,
        },
        NOW
      ),
      'in_flight'
    )
    assert.equal(
      campaignLiveRefreshMode(
        {
          status: 'scheduled',
          sentCount: 0,
          failedCount: 0,
          deliveredCount: 0,
          totalRecipients: 10,
        },
        NOW
      ),
      'in_flight'
    )
    assert.equal(campaignQueryRefetchInterval('in_flight'), CAMPAIGN_IN_FLIGHT_REFETCH_MS)
    assert.equal(campaignQueryStaleTime('in_flight'), 0)
  })

  it('does not poll drafts even when counts are incomplete', () => {
    assert.equal(
      campaignLiveRefreshMode(
        {
          status: 'draft',
          sentCount: 0,
          failedCount: 0,
          deliveredCount: 0,
          totalRecipients: 10,
        },
        NOW
      ),
      'idle'
    )
  })

  it('keeps a sent campaign in-flight while sent+failed is below total', () => {
    assert.equal(
      campaignLiveRefreshMode(
        {
          status: 'sent',
          sentCount: 3,
          failedCount: 1,
          deliveredCount: 3,
          totalRecipients: 10,
          finalizedAt: '2026-09-13T11:59:00.000Z',
        },
        NOW
      ),
      'in_flight'
    )
  })

  it('polls the 15s receipt window while delivered lags sent after finalize', () => {
    assert.equal(
      campaignLiveRefreshMode(
        {
          status: 'sent',
          sentCount: 10,
          failedCount: 0,
          deliveredCount: 4,
          totalRecipients: 10,
          finalizedAt: '2026-09-13T11:50:00.000Z',
        },
        NOW
      ),
      'receipt_window'
    )
    assert.equal(campaignQueryRefetchInterval('receipt_window'), CAMPAIGN_RECEIPT_REFETCH_MS)
    assert.equal(campaignQueryStaleTime('receipt_window'), 0)
  })

  it('falls back to updatedAt when finalizedAt is missing', () => {
    assert.equal(
      campaignLiveRefreshMode(
        {
          status: 'sent',
          sentCount: 5,
          failedCount: 0,
          deliveredCount: 1,
          totalRecipients: 5,
          updatedAt: '2026-09-13T11:55:00.000Z',
        },
        NOW
      ),
      'receipt_window'
    )
  })

  it('stops polling after the 30-minute receipt window', () => {
    assert.equal(
      campaignLiveRefreshMode(
        {
          status: 'sent',
          sentCount: 10,
          failedCount: 0,
          deliveredCount: 4,
          totalRecipients: 10,
          finalizedAt: '2026-09-13T11:00:00.000Z',
        },
        NOW
      ),
      'idle'
    )
    assert.equal(campaignQueryRefetchInterval('idle'), false)
    assert.equal(campaignQueryStaleTime('idle'), 5 * 60_000)
  })

  it('picks the most urgent mode across a list', () => {
    assert.equal(
      campaignsLiveRefreshMode(
        [
          {
            status: 'sent',
            sentCount: 5,
            failedCount: 0,
            deliveredCount: 1,
            totalRecipients: 5,
            finalizedAt: '2026-09-13T11:55:00.000Z',
          },
          {
            status: 'sending',
            sentCount: 0,
            failedCount: 0,
            deliveredCount: 0,
            totalRecipients: 2,
          },
        ],
        NOW
      ),
      'in_flight'
    )
  })
})
