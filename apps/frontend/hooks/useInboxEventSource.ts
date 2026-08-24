'use client'

import { useEffect, useState } from 'react'
import { getBaseUrl } from '@/lib/api-base'
import {
  applyAuthTokenHeaders,
  clearAccessToken,
  forceRemintAccessToken,
  getValidAccessToken,
} from '@/lib/access-token'
import { parseSseBlock, type InboxSseClientEvent } from '@/lib/inbox-sse'
import { useLatestRef } from '@/hooks/useLatestRef'

const INITIAL_RETRY_MS = 1000
const MAX_RETRY_MS = 15000

export type InboxSseConnectionStatus = 'idle' | 'connecting' | 'live' | 'reconnecting'

type UseInboxEventSourceOptions = {
  enabled: boolean
  /** Reconnect when this changes (active organization id). */
  reconnectKey: string | null
  onEvent: (event: InboxSseClientEvent) => void
  onStatusChange?: (status: InboxSseConnectionStatus) => void
  /** Fired after a successful HTTP handshake (before streaming). Use for cache catch-up. */
  onConnected?: () => void
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('Aborted', 'AbortError'))
      return
    }
    const timer = window.setTimeout(resolve, ms)
    const onAbort = () => {
      window.clearTimeout(timer)
      reject(new DOMException('Aborted', 'AbortError'))
    }
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

async function consumeSseStream(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: InboxSseClientEvent) => void,
  signal: AbortSignal
): Promise<void> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (!signal.aborted) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const blocks = buffer.split('\n\n')
      buffer = blocks.pop() ?? ''
      for (const block of blocks) {
        const event = parseSseBlock(block)
        if (event) onEvent(event)
      }
    }
  } finally {
    try {
      reader.releaseLock()
    } catch {
      // already released
    }
  }
}

/**
 * Subscribe to GET /api/v1/inbox/events.
 *
 * Uses fetch + Bearer JWT (EventSource cannot set Authorization). Reconnects
 * with backoff when the stream ends or the handshake fails. Tab visibility /
 * browser online events force an immediate reconnect (reset backoff).
 */
export function useInboxEventSource({
  enabled,
  reconnectKey,
  onEvent,
  onStatusChange,
  onConnected,
}: UseInboxEventSourceOptions) {
  const onEventRef = useLatestRef(onEvent)
  const onStatusChangeRef = useLatestRef(onStatusChange)
  const onConnectedRef = useLatestRef(onConnected)
  const [networkEpoch, setNetworkEpoch] = useState(0)

  useEffect(() => {
    if (!enabled) return

    const bump = () => setNetworkEpoch((n) => n + 1)

    const onVisibility = () => {
      if (document.visibilityState === 'visible') bump()
    }
    const onOnline = () => bump()

    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('online', onOnline)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('online', onOnline)
    }
  }, [enabled])

  useEffect(() => {
    if (!enabled || !reconnectKey) {
      onStatusChangeRef.current?.('idle')
      return
    }

    const abort = new AbortController()
    let retryMs = INITIAL_RETRY_MS
    let sawSuccess = false

    const setStatus = (status: InboxSseConnectionStatus) => {
      onStatusChangeRef.current?.(status)
    }

    const dispatch = (event: InboxSseClientEvent) => {
      onEventRef.current(event)
    }

    const connect = async () => {
      while (!abort.signal.aborted) {
        setStatus(sawSuccess ? 'reconnecting' : 'connecting')
        try {
          const token = await getValidAccessToken()
          if (abort.signal.aborted) return

          const response = await fetch(`${getBaseUrl()}/api/v1/inbox/events`, {
            method: 'GET',
            headers: {
              Accept: 'text/event-stream',
              Authorization: `Bearer ${token}`,
            },
            credentials: 'include',
            cache: 'no-store',
            signal: abort.signal,
          })

          applyAuthTokenHeaders(response)

          if (response.status === 401) {
            clearAccessToken()
            await forceRemintAccessToken()
            throw new Error('Inbox SSE unauthorized')
          }

          if (!response.ok || !response.body) {
            throw new Error(`Inbox SSE handshake failed (${response.status})`)
          }

          retryMs = INITIAL_RETRY_MS
          sawSuccess = true
          setStatus('live')
          onConnectedRef.current?.()
          await consumeSseStream(response.body, dispatch, abort.signal)
        } catch (error) {
          if (abort.signal.aborted || isAbortError(error)) return
        }

        if (abort.signal.aborted) return
        setStatus('reconnecting')
        try {
          await sleep(retryMs, abort.signal)
        } catch {
          return
        }
        retryMs = Math.min(retryMs * 2, MAX_RETRY_MS)
      }
    }

    void connect()

    return () => {
      abort.abort()
    }
  }, [enabled, onConnectedRef, onEventRef, onStatusChangeRef, reconnectKey, networkEpoch])
}
