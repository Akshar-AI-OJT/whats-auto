import { BasePolicy } from '@adonisjs/bouncer'
import type { AuthzPrincipal } from '#types/http'

export default class BillingPolicy extends BasePolicy {
  before(user: AuthzPrincipal): boolean | undefined {
    if (user.activeMember?.role === 'owner') return true
    return undefined
  }

  checkout(user: AuthzPrincipal): boolean {
    return user.memberPermissions?.has('billing:manage') ?? false
  }

  viewSubscription(user: AuthzPrincipal): boolean {
    return (
      user.memberPermissions?.has('billing:view') ||
      user.memberPermissions?.has('billing:manage') ||
      false
    )
  }

  /** Same permission set as subscription read — catalog is billing-visible data. */
  viewPlans(user: AuthzPrincipal): boolean {
    return (
      user.memberPermissions?.has('billing:view') ||
      user.memberPermissions?.has('billing:manage') ||
      false
    )
  }
}
