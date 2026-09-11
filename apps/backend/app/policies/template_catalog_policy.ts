import { BasePolicy } from '@adonisjs/bouncer'
import type { AuthzPrincipal } from '#types/http'

export default class TemplateCatalogPolicy extends BasePolicy {
  before(user: AuthzPrincipal): boolean | undefined {
    if (user.activeMember?.role === 'owner') return true
    return undefined
  }

  viewList(user: AuthzPrincipal): boolean {
    return (
      user.memberPermissions?.has('whatsapp:view') ||
      user.memberPermissions?.has('templates:view') ||
      user.memberPermissions?.has('whatsapp:manage') ||
      false
    )
  }

  install(user: AuthzPrincipal): boolean {
    return (
      user.memberPermissions?.has('whatsapp:manage') ||
      user.memberPermissions?.has('templates:create') ||
      false
    )
  }
}
