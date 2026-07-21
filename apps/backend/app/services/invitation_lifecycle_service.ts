import db from '@adonisjs/lucid/services/db'
import { APIError } from 'better-auth/api'
import { PERMISSIONS } from '#abilities/permissions'
import { AuthorizationService } from '#services/authorization_service'
import { RESERVED_ROLE_KEYS } from '#services/role_service'

function assertInviteRoleKey(role: string): string {
  const roleKey = role.split(',')[0]?.trim() ?? ''
  if (!roleKey) {
    throw new APIError('BAD_REQUEST', {
      message: 'Invite role is required',
      code: 'E_INVITE_ROLE_INVALID',
    })
  }
  if ((RESERVED_ROLE_KEYS as readonly string[]).includes(roleKey)) {
    throw new APIError('BAD_REQUEST', {
      message: `Cannot invite with reserved role "${roleKey}"`,
      code: 'E_INVITE_ROLE_RESERVED',
    })
  }
  return roleKey
}

/**
 * Invitation lifecycle (Path A):
 * - Invite / accept / reject / cancel → Better Auth `/api/auth/organization/*`
 * - Role assign / remove / ownership → our `/api/v1/members` + `/ownership/transfer`
 * - Invite `role` must be an existing dynamic org role (never `owner`)
 * - Inviter must hold product permission `team:invite` (bridged to BA `invitation:create`)
 */
export class InvitationLifecycleService {
  async assertInviteAllowed(params: {
    organizationId: string
    inviterUserId: string
    role: string
  }): Promise<void> {
    const { organizationId, inviterUserId } = params
    const roleKey = assertInviteRoleKey(params.role)

    const roleRow = await db
      .from('organization_roles')
      .where('organizationId', organizationId)
      .where('role', roleKey)
      .select('role')
      .first()

    if (!roleRow) {
      throw new APIError('BAD_REQUEST', {
        message: `Invite role "${roleKey}" does not exist in this organization`,
        code: 'E_INVITE_ROLE_MISSING',
      })
    }

    const member = await db
      .from('organization_members')
      .where('organizationId', organizationId)
      .where('userId', inviterUserId)
      .select('role')
      .first()

    if (!member) {
      throw new APIError('FORBIDDEN', {
        message: 'You are not a member of this organization',
        code: 'E_INVITE_NOT_A_MEMBER',
      })
    }

    const authz = new AuthorizationService()
    const permissions = await authz.resolvePermissions(organizationId, member.role)
    if (!authz.can(permissions, PERMISSIONS.TEAM_INVITE)) {
      throw new APIError('FORBIDDEN', {
        message: 'Missing permission: team:invite',
        code: 'E_INVITE_PERMISSION_DENIED',
      })
    }
  }

  async assertAcceptableRole(params: { organizationId: string; role: string }): Promise<void> {
    const roleKey = assertInviteRoleKey(params.role)

    const roleRow = await db
      .from('organization_roles')
      .where('organizationId', params.organizationId)
      .where('role', roleKey)
      .select('role')
      .first()

    if (!roleRow) {
      throw new APIError('BAD_REQUEST', {
        message: `Invite role "${roleKey}" no longer exists. Ask an admin to re-invite.`,
        code: 'E_INVITE_ROLE_MISSING',
      })
    }
  }
}
