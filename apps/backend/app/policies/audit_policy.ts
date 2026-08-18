import { BasePolicy } from '@adonisjs/bouncer'
import type { AuthzPrincipal } from '#types/http'

export default class AuditPolicy extends BasePolicy {
  view(user: AuthzPrincipal, requestedOrgId?: string | null): boolean {
    if (!user.memberPermissions?.has('audit:view')) return false
    if (requestedOrgId && requestedOrgId !== user.activeMember?.organizationId) {
      return false
    }
    return Boolean(user.activeMember?.organizationId)
  }
}
