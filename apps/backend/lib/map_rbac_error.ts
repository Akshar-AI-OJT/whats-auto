import type { HttpContext } from '@adonisjs/core/http'
import InvitationException from '#exceptions/invitation_exception'
import OrganizationException from '#exceptions/organization_exception'
import RoleException from '#exceptions/role_exception'

const MESSAGE_CODES: Record<string, string> = {
  'Cannot grant permissions you do not hold': 'E_PERMISSION_ESCALATION',
  'Cannot assign a role with permissions you do not hold': 'E_PERMISSION_ESCALATION',
  'Cannot change your own role': 'E_ROLE_SELF_ASSIGN',
  'Cannot change the Owner role directly. Use ownership transfer.': 'E_ROLE_CHANGE_OWNER',
  'Cannot remove the Owner. Transfer ownership first.': 'E_MEMBER_REMOVE_OWNER',
  'Cannot transfer ownership to the same member': 'E_OWNERSHIP_SAME_MEMBER',
  'Current owner not found or is no longer owner': 'E_OWNERSHIP_NOT_OWNER',
  'Target member not found in this organization': 'E_OWNERSHIP_TARGET_MISSING',
  'You are not a member of this organization': 'E_ORG_NOT_A_MEMBER',
  'User is already a member of this organization': 'E_INVITE_ALREADY_MEMBER',
  'You are already a member of this organization': 'E_INVITE_ALREADY_MEMBER',
  'Invitation not found': 'E_INVITE_NOT_FOUND',
  'Invitation is no longer pending': 'E_INVITE_NOT_PENDING',
  'Invitation has expired': 'E_INVITE_EXPIRED',
  'Invitation email does not match your account': 'E_INVITE_EMAIL_MISMATCH',
  'Only system roles can be reset to defaults': 'E_ROLE_RESET_CUSTOM',
}

/**
 * Map known service Errors to 422 JSON. Let RoleException / InvitationException /
 * OrganizationException bubble to their handlers.
 */
export function mapRbacError(error: unknown, response: HttpContext['response']) {
  if (
    error instanceof RoleException ||
    error instanceof InvitationException ||
    error instanceof OrganizationException
  ) {
    throw error
  }

  if (error instanceof Error) {
    // Dynamic messages from resolveAssignableRoleForOrg / getGlobalRoleIdByName
    if (error.message.startsWith('Role "') && error.message.includes('does not exist')) {
      return response.unprocessableEntity({
        error: error.message,
        code: 'E_ROLE_MISSING',
      })
    }

    const code = MESSAGE_CODES[error.message]
    if (code) {
      return response.unprocessableEntity({
        error: error.message,
        code,
      })
    }
  }

  throw error
}
