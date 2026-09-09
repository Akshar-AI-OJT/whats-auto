import type { AuditActorFacet, AuthorizationAuditEvent } from '@/lib/api'
import { unwrapList } from '@/components/dashboard/inbox/inbox-utils'

export type UnwrappedAuditList = {
  events: AuthorizationAuditEvent[]
  eventTypes: string[]
  actors: AuditActorFacet[]
  targetTypes: string[]
}

export function unwrapAuditList(payload: unknown): UnwrappedAuditList {
  const events = unwrapList<AuthorizationAuditEvent>(payload)
  if (!payload || typeof payload !== 'object') {
    return { events, eventTypes: [], actors: [], targetTypes: [] }
  }

  const root = payload as {
    eventTypes?: string[]
    actors?: AuditActorFacet[]
    targetTypes?: string[]
    data?: { eventTypes?: string[]; actors?: AuditActorFacet[]; targetTypes?: string[] }
  }

  const eventTypes = root.eventTypes ?? root.data?.eventTypes
  const actors = root.actors ?? root.data?.actors
  const targetTypes = root.targetTypes ?? root.data?.targetTypes

  return {
    events,
    eventTypes: Array.isArray(eventTypes) ? eventTypes : [],
    actors: Array.isArray(actors) ? actors : [],
    targetTypes: Array.isArray(targetTypes) ? targetTypes : [],
  }
}

export function actorFacetLabel(actor: AuditActorFacet, empty: string) {
  return actor.name?.trim() || actor.email?.trim() || actor.id || empty
}
