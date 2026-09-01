import { randomBytes, createHash } from 'node:crypto'
import db from '@adonisjs/lucid/services/db'
import hash from '@adonisjs/core/services/hash'
import logger from '@adonisjs/core/services/logger'
import { DateTime } from 'luxon'
import env from '#start/env'
import InvitationException from '#exceptions/invitation_exception'
import OrganizationException from '#exceptions/organization_exception'
import { OrganizationStatus } from '#enums/organization_status'
import { PlanEnforcementService } from '#services/billing/plan_enforcement_service'
import { resolveAssignableRoleForOrg } from '#services/role_service'
import { OrganizationSmtpService } from '#services/organization_smtp_service'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'

const RESET_TOKEN_TTL_HOURS = 24

function inviteFrontendBase(): string {
  return (
    env.get('CORS_ORIGIN', '').split(',')[0]?.trim().replace(/\/$/, '') || 'http://localhost:3000'
  )
}

/**
 * Expire pending setup invitations and delete Better Auth reset tokens for a user in an org.
 */
export async function revokeTeammateSetupAccess(
  trx: TransactionClientContract,
  params: { organizationId: string; userId: string }
) {
  const { organizationId, userId } = params

  await trx
    .from('organization_invitations')
    .where('organizationId', organizationId)
    .where('userId', userId)
    .where('status', 'pending')
    .update({ status: 'expired', tokenHash: null })

  await trx
    .from('verifications')
    .where('identifier', 'like', 'reset-password:%')
    .where('value', userId)
    .delete()
}

export class InvitationService {
  /**
   * Pre-provisions a teammate with a random locked password,
   * links them to the organization, and sends a password-setup email.
   */
  async provisionTeammate(params: {
    organizationId: string
    inviterId: string
    email: string
    firstname: string
    lastname?: string
    role: string
    designation?: string
  }) {
    const { organizationId, inviterId, email, firstname, lastname, role, designation } = params
    const normalizedEmail = email.toLowerCase().trim()

    const org = await db
      .from('organizations')
      .where('id', organizationId)
      .whereNull('deletedAt')
      .select('name', 'status')
      .first()

    if (!org) {
      throw OrganizationException.notFound()
    }
    if (org.status !== OrganizationStatus.ACTIVE) {
      throw InvitationException.organizationNotProvisioned()
    }

    const preCheckUser = await db
      .from('users')
      .whereRaw('LOWER(email) = ?', [normalizedEmail])
      .where('isDeleted', false)
      .select('id')
      .first()

    if (preCheckUser) {
      const isSuperadmin = await db
        .from('user_roles as ur')
        .innerJoin('roles as r', 'r.id', 'ur.roleId')
        .where('ur.userId', preCheckUser.id)
        .whereNull('ur.organizationId')
        .where('r.name', 'superadmin')
        .select('ur.id')
        .first()

      if (isSuperadmin) {
        throw InvitationException.superadminNotInvitable()
      }

      const isOwnerHere = await db
        .from('organization_members as m')
        .innerJoin('roles as r', 'r.id', 'm.roleId')
        .where('m.userId', preCheckUser.id)
        .where('m.organizationId', organizationId)
        .where('m.isDeleted', false)
        .where('r.name', 'owner')
        .select('m.id')
        .first()

      if (isOwnerHere) {
        throw InvitationException.ownerNotInvitable()
      }
    }

    const roleRow = await resolveAssignableRoleForOrg(organizationId, role)

    const memberCountRow = await db
      .from('organization_members')
      .where('organizationId', organizationId)
      .where('isDeleted', false)
      .count('* as total')
      .first()

    await new PlanEnforcementService().requireUnderLimit(
      organizationId,
      'seats',
      Number(memberCountRow?.total ?? 0)
    )

    const { userId, invitationId, isNewUser, hasExistingPassword, rawResetToken, needsSetup } =
      await db.transaction(async (trx) => {
        let user = await trx
          .from('users')
          .whereRaw('LOWER(email) = ?', [normalizedEmail])
          .where('isDeleted', false)
          .first()

        let newlyCreated = false

        if (!user) {
          const trimmedFirst = firstname.trim()
          const trimmedLast = (lastname ?? '').trim()
          const name = `${trimmedFirst} ${trimmedLast}`.trim()

          const [newUser] = await trx
            .table('users')
            .insert({
              name,
              firstname: trimmedFirst,
              lastname: trimmedLast,
              email: normalizedEmail,
              emailVerified: false,
              isActive: true,
              isDeleted: false,
            })
            .returning(['id', 'email', 'name', 'emailVerified'])

          user = newUser
          newlyCreated = true

          const lockedPassword = await hash.make(randomBytes(32).toString('hex'))
          await trx.table('accounts').insert({
            userId: user.id,
            accountId: user.id,
            providerId: 'credential',
            password: lockedPassword,
          })
        } else if (!newlyCreated) {
          const account = await trx
            .from('accounts')
            .where('userId', user.id)
            .where('providerId', 'credential')
            .first()

          if (!account) {
            const lockedPassword = await hash.make(randomBytes(32).toString('hex'))
            await trx.table('accounts').insert({
              userId: user.id,
              accountId: user.id,
              providerId: 'credential',
              password: lockedPassword,
            })
          }
        }

        const existingMember = await trx
          .from('organization_members')
          .where('organizationId', organizationId)
          .where('userId', user.id)
          .first()

        if (existingMember && !existingMember.isDeleted) {
          throw InvitationException.alreadyMember()
        }

        if (existingMember?.isDeleted) {
          await trx
            .from('organization_members')
            .where('id', existingMember.id)
            .update({
              isDeleted: false,
              deletedAt: null,
              roleId: roleRow.id,
              designation: designation ?? existingMember.designation,
              permissionVersion: Number(existingMember.permissionVersion ?? 0) + 1,
            })
        } else {
          await trx.table('organization_members').insert({
            organizationId,
            userId: user.id,
            roleId: roleRow.id,
            designation: designation ?? null,
            permissionVersion: 1,
          })
        }

        const existingRole = await trx
          .from('user_roles')
          .where('userId', user.id)
          .where('organizationId', organizationId)
          .select('id', 'roleId')
          .first()

        if (existingRole) {
          const existingRoleName = await trx
            .from('roles')
            .where('id', existingRole.roleId)
            .select('name')
            .first()

          if (existingRoleName?.name === 'owner') {
            throw InvitationException.ownerNotInvitable()
          }

          await trx.from('user_roles').where('id', existingRole.id).update({ roleId: roleRow.id })
        } else {
          await trx.table('user_roles').insert({
            userId: user.id,
            roleId: roleRow.id,
            organizationId,
          })
        }

        const account = await trx
          .from('accounts')
          .where('userId', user.id)
          .where('providerId', 'credential')
          .first()

        const userNeedsSetup = !user.emailVerified
        const hasPassword = Boolean(account?.password) && user.emailVerified === true

        let rawToken: string | null = null
        let tokenHash: string | null = null
        let inviteStatus: 'pending' | 'accepted' = hasPassword ? 'accepted' : 'pending'
        const expiresAt = DateTime.utc().plus({ hours: RESET_TOKEN_TTL_HOURS }).toSQL()!

        await trx
          .from('organization_invitations')
          .where('organizationId', organizationId)
          .where('userId', user.id)
          .where('status', 'pending')
          .update({ status: 'expired', tokenHash: null })

        if (!hasPassword) {
          rawToken = randomBytes(32).toString('hex')
          tokenHash = createHash('sha256').update(rawToken).digest('hex')

          await trx
            .from('verifications')
            .where('identifier', 'like', 'reset-password:%')
            .where('value', user.id)
            .delete()
        }

        const [invite] = await trx
          .table('organization_invitations')
          .insert({
            organizationId,
            roleId: roleRow.id,
            inviterId,
            userId: user.id,
            email: normalizedEmail,
            status: inviteStatus,
            tokenHash,
            expiresAt,
          })
          .returning(['id'])

        if (rawToken) {
          await trx.table('verifications').insert({
            identifier: `reset-password:${rawToken}`,
            value: user.id,
            expiresAt,
          })
        }

        await trx.table('authorization_audits').insert({
          organizationId,
          actorUserId: inviterId,
          targetType: 'member',
          targetId: user.id,
          eventType: 'member.provisioned',
          after: JSON.stringify({
            email: normalizedEmail,
            role,
            isNewUser: newlyCreated,
            needsSetup: userNeedsSetup,
          }),
        })

        return {
          userId: user.id as string,
          invitationId: invite.id as string,
          isNewUser: newlyCreated,
          hasExistingPassword: hasPassword,
          rawResetToken: rawToken,
          needsSetup: userNeedsSetup,
        }
      })

    const inviter = await db.from('users').where('id', inviterId).select('name').first()
    const frontendBase = inviteFrontendBase()
    let emailSent = false

    try {
      if (hasExistingPassword) {
        await this.#sendAddedToOrgEmail({
          organizationId,
          to: normalizedEmail,
          orgName: org.name as string,
          inviterName: (inviter?.name as string) || 'Your Team Administrator',
          role,
          loginLink: `${frontendBase}/login`,
        })
      } else if (rawResetToken) {
        const resetLink = `${frontendBase}/reset-password?token=${rawResetToken}`
        await this.#sendWelcomeResetEmail({
          organizationId,
          to: normalizedEmail,
          orgName: org.name as string,
          inviterName: (inviter?.name as string) || 'Your Team Administrator',
          role,
          resetLink,
        })
      }
      emailSent = true
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error(
        { email: normalizedEmail, userId, invitationId, err: errorMessage },
        'invite.email_send_failed'
      )
    }

    return {
      userId,
      invitationId,
      email: normalizedEmail,
      role,
      isNewUser,
      hasExistingPassword,
      emailSent,
      needsSetup,
    }
  }

  /**
   * Resend the password setup email for a teammate who has not yet verified email.
   */
  async resendSetupEmail(params: {
    memberId: string
    organizationId: string
    actorUserId: string
  }) {
    const { memberId, organizationId, actorUserId } = params

    const member = await db
      .from('organization_members as m')
      .innerJoin('users as u', 'u.id', 'm.userId')
      .where('m.id', memberId)
      .where('m.organizationId', organizationId)
      .where('m.isDeleted', false)
      .select('m.userId', 'u.email', 'u.emailVerified')
      .first()

    if (!member) {
      throw InvitationException.setupNotFound()
    }

    const userId = member.userId as string

    if (member.emailVerified) {
      throw InvitationException.passwordAlreadySet()
    }

    const rawToken = randomBytes(32).toString('hex')
    const tokenHash = createHash('sha256').update(rawToken).digest('hex')
    const expiresAt = DateTime.utc().plus({ hours: RESET_TOKEN_TTL_HOURS }).toSQL()!

    let invitationId: string

    await db.transaction(async (trx) => {
      await trx
        .from('verifications')
        .where('identifier', 'like', 'reset-password:%')
        .where('value', userId)
        .delete()

      const invitation = await trx
        .from('organization_invitations')
        .where('organizationId', organizationId)
        .where('userId', userId)
        .orderBy('createdAt', 'desc')
        .first()

      if (invitation) {
        invitationId = invitation.id as string
        await trx
          .from('organization_invitations')
          .where('id', invitation.id)
          .update({ status: 'pending', tokenHash, expiresAt })
      } else {
        const roleRow = await trx
          .from('organization_members as m')
          .innerJoin('roles as r', 'r.id', 'm.roleId')
          .where('m.id', memberId)
          .select('r.id as roleId')
          .firstOrFail()

        const [invite] = await trx
          .table('organization_invitations')
          .insert({
            organizationId,
            roleId: roleRow.roleId,
            inviterId: actorUserId,
            userId,
            email: (member.email as string).toLowerCase(),
            status: 'pending',
            tokenHash,
            expiresAt,
          })
          .returning(['id'])

        invitationId = invite.id as string
      }

      await trx.table('verifications').insert({
        identifier: `reset-password:${rawToken}`,
        value: userId,
        expiresAt,
      })
    })

    const org = await db.from('organizations').where('id', organizationId).select('name').first()
    const actor = await db.from('users').where('id', actorUserId).select('name').first()
    const roleRow = await db
      .from('organization_members as m')
      .innerJoin('roles as r', 'r.id', 'm.roleId')
      .where('m.id', memberId)
      .select('r.name as role')
      .first()

    const resetLink = `${inviteFrontendBase()}/reset-password?token=${rawToken}`

    await this.#sendWelcomeResetEmail({
      organizationId,
      to: member.email as string,
      orgName: (org?.name as string) || 'your organization',
      inviterName: (actor?.name as string) || 'Your Team Administrator',
      role: (roleRow?.role as string) || 'teammate',
      resetLink,
    })

    return { ok: true as const, invitationId: invitationId! }
  }

  async #sendWelcomeResetEmail(params: {
    organizationId: string
    to: string
    orgName: string
    inviterName: string
    role: string
    resetLink: string
  }) {
    const html = `
      <div style="margin:0; padding:40px 20px; background-color:#f4f6f8; font-family:Arial,Helvetica,sans-serif;">
        <div style="max-width:560px; margin:0 auto; background:#ffffff; border:1px solid #e5e7eb; border-radius:12px; overflow:hidden;">
          <div style="padding:28px 32px; border-bottom:1px solid #e5e7eb;">
            <div style="font-size:22px; font-weight:700; color:#111827;">Whats-Auto</div>
          </div>
          <div style="padding:32px;">
            <h1 style="margin:0 0 16px; font-size:24px; line-height:32px; color:#111827;">
              Welcome to ${params.orgName}!
            </h1>
            <p style="margin:0 0 16px; font-size:15px; line-height:24px; color:#4b5563;">
              <strong>${params.inviterName}</strong> has created your account on <strong>${params.orgName}</strong> as a <strong>${params.role}</strong>.
            </p>
            <p style="margin:0 0 24px; font-size:15px; line-height:24px; color:#4b5563;">
              Click the button below to set your password and access your dashboard.
            </p>
            <div style="margin:0 0 24px;">
              <a href="${params.resetLink}" style="display:inline-block; padding:12px 24px; background-color:#111827; color:#ffffff; text-decoration:none; font-size:15px; font-weight:600; border-radius:8px;">
                Set Password &amp; Get Started
              </a>
            </div>
            <p style="font-size:13px; color:#6b7280;">This link is valid for <strong>24 hours</strong>.</p>
          </div>
        </div>
      </div>
    `
    await new OrganizationSmtpService().sendOrgEmail({
      organizationId: params.organizationId,
      to: params.to,
      subject: `Welcome to ${params.orgName} — Set your password`,
      html,
      emailKind: 'invitation',
    })
  }

  async #sendAddedToOrgEmail(params: {
    organizationId: string
    to: string
    orgName: string
    inviterName: string
    role: string
    loginLink: string
  }) {
    const html = `
      <div style="margin:0; padding:40px 20px; background-color:#f4f6f8; font-family:Arial,Helvetica,sans-serif;">
        <div style="max-width:560px; margin:0 auto; background:#ffffff; border:1px solid #e5e7eb; border-radius:12px; overflow:hidden;">
          <div style="padding:28px 32px; border-bottom:1px solid #e5e7eb;">
            <div style="font-size:22px; font-weight:700; color:#111827;">Whats-Auto</div>
          </div>
          <div style="padding:32px;">
            <h1 style="margin:0 0 16px; font-size:24px; line-height:32px; color:#111827;">
              You've been added to ${params.orgName}
            </h1>
            <p style="margin:0 0 24px; font-size:15px; line-height:24px; color:#4b5563;">
              <strong>${params.inviterName}</strong> has added your existing account to <strong>${params.orgName}</strong> as a <strong>${params.role}</strong>.
              Sign in with your existing credentials to access this organization.
            </p>
            <a href="${params.loginLink}" style="display:inline-block; padding:12px 24px; background-color:#111827; color:#ffffff; text-decoration:none; font-size:15px; font-weight:600; border-radius:8px;">
              Sign In
            </a>
          </div>
        </div>
      </div>
    `
    await new OrganizationSmtpService().sendOrgEmail({
      organizationId: params.organizationId,
      to: params.to,
      subject: `You've been added to ${params.orgName}`,
      html,
      emailKind: 'invitation',
    })
  }
}
