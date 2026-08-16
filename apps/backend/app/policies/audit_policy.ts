import { BasePolicy } from '@adonisjs/bouncer'
import type { AuthzPrincipal } from '#types/http'

export default class AuditPolicy extends BasePolicy {
  view(user: AuthzPrincipal, requestedOrgId?: string | null): boolean {
    const isPlatformAuditor = user.memberPermissions?.has('platform:audit_view')
    if (isPlatformAuditor) return true

    // Tenant user: must have team:view and cannot query another org's audit
    if (!user.memberPermissions?.has('team:view')) return false
    if (requestedOrgId && requestedOrgId !== user.activeMember?.organizationId) {
      return false
    }
    return true
  }
}
