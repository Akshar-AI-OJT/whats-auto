import { BasePolicy } from '@adonisjs/bouncer'
import type { AuthzPrincipal } from '#types/http'

export type MessageTemplateResource = {
  id?: string
  organizationId: string
}

export default class MessageTemplatePolicy extends BasePolicy {
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

  view(user: AuthzPrincipal, template?: MessageTemplateResource): boolean {
    if (
      !user.memberPermissions?.has('whatsapp:view') &&
      !user.memberPermissions?.has('templates:view') &&
      !user.memberPermissions?.has('whatsapp:manage')
    ) {
      return false
    }
    if (template && template.organizationId !== user.activeMember?.organizationId) {
      return false
    }
    return true
  }

  create(user: AuthzPrincipal): boolean {
    return (
      user.memberPermissions?.has('whatsapp:manage') ||
      user.memberPermissions?.has('templates:create') ||
      false
    )
  }

  sync(user: AuthzPrincipal): boolean {
    return (
      user.memberPermissions?.has('whatsapp:manage') ||
      user.memberPermissions?.has('templates:sync') ||
      false
    )
  }

  destroy(user: AuthzPrincipal, template?: MessageTemplateResource): boolean {
    if (
      !user.memberPermissions?.has('whatsapp:manage') &&
      !user.memberPermissions?.has('templates:delete')
    ) {
      return false
    }
    if (template && template.organizationId !== user.activeMember?.organizationId) {
      return false
    }
    return true
  }
}
