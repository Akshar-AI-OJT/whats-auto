import { BasePolicy } from '@adonisjs/bouncer'
import type { AuthzPrincipal } from '#types/http'

export type WhatsappConfigResource = {
  id?: string
  organizationId: string
  status?: string
}

export default class WhatsappConfigPolicy extends BasePolicy {
  before(user: AuthzPrincipal): boolean | undefined {
    if (user.activeMember?.role === 'owner') return true
    return undefined
  }

  viewList(user: AuthzPrincipal): boolean {
    return (
      user.memberPermissions?.has('whatsapp:view') ||
      user.memberPermissions?.has('whatsapp:manage') ||
      false
    )
  }

  connect(user: AuthzPrincipal): boolean {
    return (
      user.memberPermissions?.has('whatsapp:connect') ||
      user.memberPermissions?.has('whatsapp:manage') ||
      false
    )
  }

  view(user: AuthzPrincipal, config?: WhatsappConfigResource): boolean {
    if (
      !user.memberPermissions?.has('whatsapp:view') &&
      !user.memberPermissions?.has('whatsapp:manage')
    ) {
      return false
    }
    if (config && config.organizationId !== user.activeMember?.organizationId) {
      return false
    }
    return true
  }

  disconnect(user: AuthzPrincipal, config?: WhatsappConfigResource): boolean {
    if (!user.memberPermissions?.has('whatsapp:manage')) return false
    if (config && config.organizationId !== user.activeMember?.organizationId) {
      return false
    }
    return true
  }

  test(user: AuthzPrincipal, config?: WhatsappConfigResource): boolean {
    if (!user.memberPermissions?.has('whatsapp:manage')) return false
    if (config && config.organizationId !== user.activeMember?.organizationId) {
      return false
    }
    return true
  }
}
