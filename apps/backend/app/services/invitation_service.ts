import db from '@adonisjs/lucid/services/db'
import logger from '@adonisjs/core/services/logger'
import { DateTime } from 'luxon'
import env from '#start/env'
import { resend } from '#lib/mail'
import InvitationException from '#exceptions/invitation_exception'
import { resolveAssignableRoleForOrg } from '#services/role_service'
import { NotificationService } from '#services/notification_service'

const INVITE_TTL_HOURS = 24

/** Postgres unique_violation, including Knex/Lucid-wrapped errors. */
function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error
  for (let depth = 0; depth < 4 && current && typeof current === 'object'; depth++) {
    const code = (current as { code?: string }).code
    if (code === '23505') return true
    current = (current as { cause?: unknown }).cause ?? (current as { original?: unknown }).original
  }
  return false
}

export class InvitationService {
  /**
   * Create a pending invitation and send the invite email.
   */
  async createInvitation(params: {
    organizationId: string
    inviterId: string
    email: string
    role: string
  }) {
    const { organizationId, inviterId, email, role } = params
    const normalizedEmail = email.toLowerCase()

    const roleRow = await resolveAssignableRoleForOrg(organizationId, role)

    const existingMember = await db
      .from('organization_members as m')
      .innerJoin('users as u', 'u.id', 'm.userId')
      .where('m.organizationId', organizationId)
      .where('m.isDeleted', false)
      .whereRaw('LOWER(u.email) = ?', [normalizedEmail])
      .select('m.id')
      .first()

    if (existingMember) {
      throw new Error('User is already a member of this organization')
    }

    const existingPending = await db
      .from('organization_invitations')
      .where('organizationId', organizationId)
      .whereRaw('LOWER(email) = ?', [normalizedEmail])
      .where('status', 'pending')
      .select('id')
      .first()

    if (existingPending) {
      throw InvitationException.alreadyPending()
    }

    const org = await db
      .from('organizations')
      .where('id', organizationId)
      .whereNull('deletedAt')
      .select('name')
      .firstOrFail()

    const inviter = await db.from('users').where('id', inviterId).select('name').firstOrFail()

    const expiresAt = DateTime.utc().plus({ hours: INVITE_TTL_HOURS }).toSQL()!

    let invitation: {
      id: string
      email: string
      status: string
      expiresAt: string
      createdAt: string
    }

    try {
      invitation = await db.transaction(async (trx) => {
        const [row] = await trx
          .table('organization_invitations')
          .insert({
            organizationId,
            roleId: roleRow.id,
            inviterId,
            email: normalizedEmail,
            status: 'pending',
            expiresAt,
          })
          .returning(['id', 'email', 'status', 'expiresAt', 'createdAt'])

        await trx.table('authorization_audits').insert({
          organizationId,
          actorUserId: inviterId,
          targetType: 'invitation',
          targetId: row.id,
          eventType: 'invitation.created',
          after: JSON.stringify({ email: normalizedEmail, role }),
        })

        return row
      })
    } catch (error) {
      // Race: another pending invite for the same email landed first.
      if (isUniqueViolation(error)) {
        throw InvitationException.alreadyPending()
      }
      throw error
    }

    const inviteLink = `${env.get('CORS_ORIGIN')}/accept-invitation/${invitation.id}`
    try {
      const { error } = await resend.emails.send({
        from: env.get('EMAIL_FROM'),
        to: normalizedEmail,
        subject: `You've been invited to ${org.name}`,
        html: `
        <p>${inviter.name} invited you to join <strong>${org.name}</strong> as <strong>${role}</strong>.</p>
        <p><a href="${inviteLink}">Accept Invitation</a> — link expires in ${INVITE_TTL_HOURS} hours.</p>
      `,
      })
      if (error) {
        // Resend test domain (onboarding@resend.dev) only delivers to the account email.
        // Mirror pre_signup OTP: keep invites usable in development by logging the link.
        if (env.get('NODE_ENV') === 'development') {
          console.warn(`[DEV] Resend failed for invite ${normalizedEmail}: ${error.message}`)
          console.warn(`[DEV] Invitation link: ${inviteLink}`)
        } else {
          throw InvitationException.emailSendFailed(error.message)
        }
      } else if (env.get('NODE_ENV') === 'development') {
        console.info(`[DEV] Invite email sent to ${normalizedEmail}. Link: ${inviteLink}`)
      }
    } catch (error) {
      if (error instanceof InvitationException) {
        // Do not leave a pending invite that the recipient never received.
        await db.from('organization_invitations').where('id', invitation.id).delete()
        throw error
      }
      if (env.get('NODE_ENV') === 'development') {
        console.warn(
          `[DEV] Invite email threw for ${normalizedEmail}: ${error instanceof Error ? error.message : error}`
        )
        console.warn(`[DEV] Invitation link: ${inviteLink}`)
      } else {
        await db.from('organization_invitations').where('id', invitation.id).delete()
        throw InvitationException.emailSendFailed(
          error instanceof Error ? error.message : undefined
        )
      }
    }

    // After invitation is successfully created (and kept) — best-effort notify existing users only.
    await this.#notifyInviteeInvitationCreatedBestEffort({
      organizationId,
      inviterId,
      inviteeEmail: normalizedEmail,
      workspaceName: org.name as string,
      role,
    })

    return {
      id: invitation.id as string,
      email: invitation.email as string,
      role,
      status: invitation.status as string,
      expiresAt: invitation.expiresAt as string,
      createdAt: invitation.createdAt as string,
    }
  }

  /**
   * Best-effort in-app notification for an existing invitee user after invitation creation.
   * Skips when no user matches the invite email. Never throws.
   */
  async #notifyInviteeInvitationCreatedBestEffort(params: {
    organizationId: string
    inviterId: string
    inviteeEmail: string
    workspaceName: string
    role: string
  }): Promise<void> {
    let recipientUserId: string | undefined
    try {
      const invitee = await db
        .from('users')
        .whereRaw('LOWER(email) = ?', [params.inviteeEmail])
        .select('id')
        .first()

      if (!invitee) return

      recipientUserId = invitee.id as string

      await new NotificationService().createNotification({
        organizationId: params.organizationId,
        userId: recipientUserId,
        type: 'team_invitation_created',
        title: "You've been invited",
        body: `You've been invited to join ${params.workspaceName} as ${params.role}.`,
        actorUserId: params.inviterId,
      })
    } catch (error) {
      logger.error(
        {
          organizationId: params.organizationId,
          userId: recipientUserId,
          type: 'team_invitation_created',
          err: error instanceof Error ? error.message : 'unknown',
        },
        'team.notification_failed'
      )
    }
  }

  /**
   * List pending invitations for an organization.
   */
  async listInvitations(organizationId: string) {
    const rows = await db
      .from('organization_invitations as i')
      .innerJoin('roles as r', 'r.id', 'i.roleId')
      .innerJoin('users as u', 'u.id', 'i.inviterId')
      .where('i.organizationId', organizationId)
      .where('i.status', 'pending')
      .select(
        'i.id',
        'i.email',
        'r.name as role',
        'u.name as inviterName',
        'i.createdAt',
        'i.expiresAt'
      )
      .orderBy('i.createdAt', 'desc')

    return rows.map((r) => ({
      id: r.id as string,
      email: r.email as string,
      role: r.role as string,
      inviterName: r.inviterName as string,
      createdAt: r.createdAt as string,
      expiresAt: r.expiresAt as string,
    }))
  }

  /**
   * Public-safe invitation preview (no auth required — invitation id is the secret).
   */
  async getInvitationPreview(invitationId: string) {
    const row = await db
      .from('organization_invitations as i')
      .innerJoin('organizations as o', 'o.id', 'i.organizationId')
      .innerJoin('roles as r', 'r.id', 'i.roleId')
      .innerJoin('users as u', 'u.id', 'i.inviterId')
      .where('i.id', invitationId)
      .whereNull('o.deletedAt')
      .select(
        'i.id',
        'i.email',
        'i.status',
        'i.expiresAt',
        'o.name as organizationName',
        'r.name as role',
        'u.name as inviterName'
      )
      .first()

    if (!row) {
      throw new Error('Invitation not found')
    }

    return {
      id: row.id as string,
      email: row.email as string,
      status: row.status as string,
      expiresAt: row.expiresAt as string,
      organizationName: row.organizationName as string,
      role: row.role as string,
      inviterName: row.inviterName as string,
    }
  }

  /**
   * Accept a pending invitation. Creates or revives organization_members +
   * user_roles and makes the joined organization active on the caller's session.
   */
  async acceptInvitation(params: {
    invitationId: string
    userId: string
    userEmail: string
    sessionId: string
  }) {
    const { invitationId, userId, userEmail, sessionId } = params

    const invitation = await db
      .from('organization_invitations')
      .where('id', invitationId)
      .firstOrFail()

    if (invitation.status !== 'pending') {
      throw new Error('Invitation is no longer pending')
    }

    if (DateTime.fromJSDate(new Date(invitation.expiresAt as string)) < DateTime.utc()) {
      throw new Error('Invitation has expired')
    }

    if ((invitation.email as string).toLowerCase() !== userEmail.toLowerCase()) {
      throw new Error('Invitation email does not match your account')
    }

    const existingMembership = await db
      .from('organization_members')
      .where('organizationId', invitation.organizationId)
      .where('userId', userId)
      .select('id', 'isDeleted')
      .first()

    if (existingMembership && !existingMembership.isDeleted) {
      throw new Error('You are already a member of this organization')
    }

    await db.transaction(async (trx) => {
      if (existingMembership?.isDeleted) {
        // Re-join: revive the soft-deleted membership rather than inserting a second row.
        await trx.rawQuery(
          `UPDATE "organization_members"
           SET "isDeleted" = false,
               "deletedAt" = NULL,
               "roleId" = ?,
               "permissionVersion" = "permissionVersion" + 1
           WHERE "id" = ?`,
          [invitation.roleId, existingMembership.id]
        )
      } else {
        await trx.table('organization_members').insert({
          organizationId: invitation.organizationId,
          userId,
          roleId: invitation.roleId,
        })
      }

      // removeMember may leave user_roles behind today; upsert so re-invite always works.
      const existingRole = await trx
        .from('user_roles')
        .where('userId', userId)
        .where('organizationId', invitation.organizationId)
        .select('id')
        .first()

      if (existingRole) {
        await trx.from('user_roles').where('id', existingRole.id).update({
          roleId: invitation.roleId,
        })
      } else {
        await trx.table('user_roles').insert({
          userId,
          roleId: invitation.roleId,
          organizationId: invitation.organizationId,
        })
      }

      await trx
        .from('organization_invitations')
        .where('id', invitationId)
        .update({ status: 'accepted' })

      await trx.from('sessions').where('id', sessionId).update({
        activeOrganizationId: invitation.organizationId,
      })

      await trx.table('authorization_audits').insert({
        organizationId: invitation.organizationId,
        actorUserId: userId,
        targetType: 'invitation',
        targetId: invitationId,
        eventType: 'invitation.accepted',
        after: JSON.stringify({ userId, revived: Boolean(existingMembership?.isDeleted) }),
      })
    })

    // After pending → accepted commits — best-effort notify must not roll back acceptance.
    await this.#notifyInviterInvitationAcceptedBestEffort({
      organizationId: invitation.organizationId as string,
      inviterId: invitation.inviterId as string,
      actorUserId: userId,
    })

    return { organizationId: invitation.organizationId as string }
  }

  /**
   * Best-effort in-app notification for the inviter after invitation acceptance. Never throws.
   */
  async #notifyInviterInvitationAcceptedBestEffort(params: {
    organizationId: string
    inviterId: string
    actorUserId: string
  }): Promise<void> {
    try {
      const [accepter, org] = await Promise.all([
        db.from('users').where('id', params.actorUserId).select('name').first(),
        db.from('organizations').where('id', params.organizationId).select('name').first(),
      ])

      const userName = (accepter?.name as string | undefined) ?? 'A user'
      const workspaceName = (org?.name as string | undefined) ?? 'the workspace'

      await new NotificationService().createNotification({
        organizationId: params.organizationId,
        userId: params.inviterId,
        type: 'team_invitation_accepted',
        title: 'Invitation accepted',
        body: `${userName} accepted your invitation and joined ${workspaceName}.`,
        actorUserId: params.actorUserId,
      })
    } catch (error) {
      logger.error(
        {
          organizationId: params.organizationId,
          userId: params.inviterId,
          type: 'team_invitation_accepted',
          err: error instanceof Error ? error.message : 'unknown',
        },
        'team.notification_failed'
      )
    }
  }

  /**
   * Reject a pending invitation.
   * Auth is optional: the invitation id is the secret (same model as preview).
   * When authenticated, email must still match the invite.
   */
  async rejectInvitation(params: { invitationId: string; userEmail?: string }) {
    const { invitationId, userEmail } = params

    const invitation = await db
      .from('organization_invitations')
      .where('id', invitationId)
      .firstOrFail()

    if (invitation.status !== 'pending') {
      throw new Error('Invitation is no longer pending')
    }

    if (userEmail && (invitation.email as string).toLowerCase() !== userEmail.toLowerCase()) {
      throw new Error('Invitation email does not match your account')
    }

    await db.transaction(async (trx) => {
      await trx
        .from('organization_invitations')
        .where('id', invitationId)
        .update({ status: 'rejected' })

      await trx.table('authorization_audits').insert({
        organizationId: invitation.organizationId,
        actorUserId: null,
        targetType: 'invitation',
        targetId: invitationId,
        eventType: 'invitation.rejected',
      })
    })
  }

  /**
   * Cancel a pending invitation (org member with team:invite).
   */
  async cancelInvitation(params: {
    invitationId: string
    organizationId: string
    actorUserId: string
  }) {
    const { invitationId, organizationId, actorUserId } = params

    const invitation = await db
      .from('organization_invitations')
      .where('id', invitationId)
      .where('organizationId', organizationId)
      .firstOrFail()

    if (invitation.status !== 'pending') {
      throw new Error('Invitation is no longer pending')
    }

    await db.transaction(async (trx) => {
      await trx
        .from('organization_invitations')
        .where('id', invitationId)
        .update({ status: 'canceled' })

      await trx.table('authorization_audits').insert({
        organizationId,
        actorUserId,
        targetType: 'invitation',
        targetId: invitationId,
        eventType: 'invitation.canceled',
      })
    })
  }
}
