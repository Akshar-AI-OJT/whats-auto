import { BasePolicy, AuthorizationResponse } from '@adonisjs/bouncer'
import type { AuthzPrincipal } from '#types/http'

export type CampaignResource = {
  id?: string
  organizationId: string
  status?: string
}

export default class CampaignPolicy extends BasePolicy {
  before(user: AuthzPrincipal): boolean | undefined {
    if (user.activeMember?.role === 'owner') return true
    return undefined
  }

  viewList(user: AuthzPrincipal): boolean {
    return user.memberPermissions?.has('campaigns:view') ?? false
  }

  view(user: AuthzPrincipal, campaign?: CampaignResource): boolean {
    if (!user.memberPermissions?.has('campaigns:view')) return false
    if (campaign && campaign.organizationId !== user.activeMember?.organizationId) {
      return false
    }
    return true
  }

  create(user: AuthzPrincipal): boolean {
    return user.memberPermissions?.has('campaigns:create') ?? false
  }

  preview(user: AuthzPrincipal, campaign?: CampaignResource): boolean {
    if (!user.memberPermissions?.has('campaigns:view')) return false
    if (campaign && campaign.organizationId !== user.activeMember?.organizationId) {
      return false
    }
    return true
  }

  send(user: AuthzPrincipal, campaign?: CampaignResource): boolean | AuthorizationResponse {
    if (!user.memberPermissions?.has('campaigns:launch')) {
      return AuthorizationResponse.deny('Permission denied: campaigns:launch', 403)
    }
    if (campaign && campaign.organizationId !== user.activeMember?.organizationId) {
      return AuthorizationResponse.deny('Campaign not found', 404)
    }
    if (campaign?.status && !['draft', 'scheduled'].includes(campaign.status)) {
      return AuthorizationResponse.deny(
        `Campaign with status "${campaign.status}" is not eligible to send`,
        422
      )
    }
    return true
  }

  schedule(user: AuthzPrincipal, campaign?: CampaignResource): boolean | AuthorizationResponse {
    if (!user.memberPermissions?.has('campaigns:edit')) {
      return AuthorizationResponse.deny('Permission denied: campaigns:edit', 403)
    }
    if (campaign && campaign.organizationId !== user.activeMember?.organizationId) {
      return AuthorizationResponse.deny('Campaign not found', 404)
    }
    if (campaign?.status && !['draft', 'scheduled'].includes(campaign.status)) {
      return AuthorizationResponse.deny(
        `Campaign with status "${campaign.status}" is not eligible to schedule`,
        422
      )
    }
    return true
  }

  cancel(user: AuthzPrincipal, campaign?: CampaignResource): boolean | AuthorizationResponse {
    if (!user.memberPermissions?.has('campaigns:pause')) {
      return AuthorizationResponse.deny('Permission denied: campaigns:pause', 403)
    }
    if (campaign && campaign.organizationId !== user.activeMember?.organizationId) {
      return AuthorizationResponse.deny('Campaign not found', 404)
    }
    if (campaign?.status && !['scheduled', 'sending'].includes(campaign.status)) {
      return AuthorizationResponse.deny(
        `Campaign with status "${campaign.status}" is not eligible to cancel schedule`,
        422
      )
    }
    return true
  }

  replaceRecipients(
    user: AuthzPrincipal,
    campaign?: CampaignResource
  ): boolean | AuthorizationResponse {
    if (!user.memberPermissions?.has('campaigns:edit')) {
      return AuthorizationResponse.deny('Permission denied: campaigns:edit', 403)
    }
    if (campaign && campaign.organizationId !== user.activeMember?.organizationId) {
      return AuthorizationResponse.deny('Campaign not found', 404)
    }
    return true
  }

  duplicate(user: AuthzPrincipal, campaign?: CampaignResource): boolean | AuthorizationResponse {
    if (!user.memberPermissions?.has('campaigns:create')) {
      return AuthorizationResponse.deny('Permission denied: campaigns:create', 403)
    }
    if (campaign && campaign.organizationId !== user.activeMember?.organizationId) {
      return AuthorizationResponse.deny('Campaign not found', 404)
    }
    return true
  }

  changeStatus(user: AuthzPrincipal, campaign?: CampaignResource): boolean | AuthorizationResponse {
    if (!user.memberPermissions?.has('campaigns:edit')) {
      return AuthorizationResponse.deny('Permission denied: campaigns:edit', 403)
    }
    if (campaign && campaign.organizationId !== user.activeMember?.organizationId) {
      return AuthorizationResponse.deny('Campaign not found', 404)
    }
    return true
  }

  update(user: AuthzPrincipal, campaign?: CampaignResource): boolean | AuthorizationResponse {
    if (!user.memberPermissions?.has('campaigns:edit')) {
      return AuthorizationResponse.deny('Permission denied: campaigns:edit', 403)
    }
    if (campaign && campaign.organizationId !== user.activeMember?.organizationId) {
      return AuthorizationResponse.deny('Campaign not found', 404)
    }
    if (campaign?.status && !['draft', 'scheduled'].includes(campaign.status)) {
      return AuthorizationResponse.deny(
        `Campaign with status "${campaign.status}" is not editable`,
        422
      )
    }
    return true
  }

  delete(user: AuthzPrincipal, campaign?: CampaignResource): boolean | AuthorizationResponse {
    if (!user.memberPermissions?.has('campaigns:delete')) {
      return AuthorizationResponse.deny('Permission denied: campaigns:delete', 403)
    }
    if (campaign && campaign.organizationId !== user.activeMember?.organizationId) {
      return AuthorizationResponse.deny('Campaign not found', 404)
    }
    return true
  }
}
