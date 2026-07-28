import db from '@adonisjs/lucid/services/db'
import { OrganizationService } from '#services/organization_service'

export type OnboardingStep =
  'accept_invitation' | 'create_organization' | 'select_organization' | 'ready'

export type PendingInvitation = {
  id: string
  organizationId: string
  organizationName: string
  role: string
  inviterName: string
  expiresAt: string
}

/**
 * Decide what the client should show after login / signup verification.
 *
 * Invitations only take over onboarding for users with no organization yet —
 * an existing member who gets invited elsewhere keeps landing in their workspace
 * and sees the invite as a notification instead.
 */
export function resolveNextStep(params: {
  organizationCount: number
  pendingInvitationCount: number
  activeOrganizationId: string | null
}): OnboardingStep {
  const { organizationCount, pendingInvitationCount, activeOrganizationId } = params

  if (organizationCount === 0) {
    return pendingInvitationCount > 0 ? 'accept_invitation' : 'create_organization'
  }

  return activeOrganizationId ? 'ready' : 'select_organization'
}

export class OnboardingService {
  /**
   * Pending, unexpired invitations addressed to this email.
   */
  async listPendingInvitationsForEmail(email: string): Promise<PendingInvitation[]> {
    const rows = await db
      .from('organization_invitations as i')
      .innerJoin('organizations as o', 'o.id', 'i.organizationId')
      .innerJoin('roles as r', 'r.id', 'i.roleId')
      .innerJoin('users as u', 'u.id', 'i.inviterId')
      .whereRaw('LOWER(i.email) = ?', [email.toLowerCase()])
      .where('i.status', 'pending')
      .where('i.expiresAt', '>', new Date())
      .whereNull('o.deletedAt')
      .select(
        'i.id',
        'i.expiresAt',
        'o.id as organizationId',
        'o.name as organizationName',
        'r.name as role',
        'u.name as inviterName'
      )
      .orderBy('i.createdAt', 'desc')

    return rows.map((r) => ({
      id: r.id as string,
      organizationId: r.organizationId as string,
      organizationName: r.organizationName as string,
      role: r.role as string,
      inviterName: r.inviterName as string,
      expiresAt: r.expiresAt as string,
    }))
  }

  /**
   * Single source of truth for post-auth routing.
   */
  async getState(params: { userId: string; email: string; activeOrganizationId?: string }) {
    const [organizations, pendingInvitations] = await Promise.all([
      new OrganizationService().listMyOrganizations(params.userId),
      this.listPendingInvitationsForEmail(params.email),
    ])

    // Session may still point at an org the user left or that was deleted.
    const activeOrganizationId =
      params.activeOrganizationId &&
      organizations.some((org) => org.id === params.activeOrganizationId)
        ? params.activeOrganizationId
        : null

    return {
      activeOrganizationId,
      organizations,
      pendingInvitations,
      nextStep: resolveNextStep({
        organizationCount: organizations.length,
        pendingInvitationCount: pendingInvitations.length,
        activeOrganizationId,
      }),
    }
  }
}
