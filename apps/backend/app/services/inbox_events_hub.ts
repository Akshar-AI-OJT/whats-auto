/**
 * In-process SSE fan-out for inbox domain events.
 * HTTP clients subscribe here; cross-process publishers use InboxSseBus (Redis pub/sub).
 */

export type InboxSseEventType =
  | 'message.received'
  | 'message.queued'
  | 'message.sent'
  | 'message.failed'
  | 'status.updated'
  | 'ai.generation.started'
  | 'ai.token.delta'
  | 'ai.generation.completed'
  | 'ai.handover.triggered'
  | 'conversation.ai_mode.updated'
  | 'ping'

export type InboxSseEvent = {
  type: InboxSseEventType
  organizationId: string
  payload: Record<string, unknown>
}

type Client = {
  organizationId: string
  write: (chunk: string) => void
  close: () => void
}

class InboxEventsHub {
  #clients = new Set<Client>()

  subscribe(params: {
    organizationId: string
    write: (chunk: string) => void
    close: () => void
  }): () => void {
    const client: Client = {
      organizationId: params.organizationId,
      write: params.write,
      close: params.close,
    }
    this.#clients.add(client)

    return () => {
      this.#clients.delete(client)
    }
  }

  publish(event: InboxSseEvent): void {
    const data = `event: ${event.type}\ndata: ${JSON.stringify({
      type: event.type,
      organizationId: event.organizationId,
      payload: event.payload,
    })}\n\n`

    for (const client of this.#clients) {
      if (client.organizationId !== event.organizationId) continue
      try {
        client.write(data)
      } catch {
        this.#clients.delete(client)
        try {
          client.close()
        } catch {
          // ignore
        }
      }
    }
  }

  clientCount(organizationId?: string): number {
    if (!organizationId) return this.#clients.size
    let count = 0
    for (const client of this.#clients) {
      if (client.organizationId === organizationId) count += 1
    }
    return count
  }
}

export const inboxEventsHub = new InboxEventsHub()
