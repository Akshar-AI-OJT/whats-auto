import type { AuditActorFacet, AuthorizationAuditEvent } from '@/lib/api'
import { unwrapList } from '@/lib/api-unwrap'

export type UnwrappedAuditList = {
  events: AuthorizationAuditEvent[]
  eventTypes: string[]
  actors: AuditActorFacet[]
  targetTypes: string[]
}

export function unwrapAuditList(payload: unknown): UnwrappedAuditList {
  const events = unwrapList<AuthorizationAuditEvent>(payload)
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { events, eventTypes: [], actors: [], targetTypes: [] }
  }

  const root = payload as {
    eventTypes?: string[]
    actors?: AuditActorFacet[]
    targetTypes?: string[]
  }

  return {
    events,
    eventTypes: Array.isArray(root.eventTypes) ? root.eventTypes : [],
    actors: Array.isArray(root.actors) ? root.actors : [],
    targetTypes: Array.isArray(root.targetTypes) ? root.targetTypes : [],
  }
}

export function actorFacetLabel(actor: AuditActorFacet, empty: string) {
  return actor.name?.trim() || actor.email?.trim() || actor.id || empty
}
