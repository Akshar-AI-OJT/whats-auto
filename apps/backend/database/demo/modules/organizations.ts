import db from '@adonisjs/lucid/services/db'
import { PERMISSIONS } from '#abilities/permissions'
import { DEMO_ORGS, DEMO_USERS } from '#database/demo/credentials'
import { FIXTURE_IDS } from '#database/demo/fixture_ids'
import { daysFromNow, jsonb, upsertById } from '#database/demo/helpers'
import type { DemoSeedModule } from '#database/demo/types'

async function globalRoleId(name: string): Promise<string> {
  const row = await db
    .from('roles')
    .whereNull('organizationId')
    .where('name', name)
    .select('id')
    .first()
  if (!row) throw new Error(`Demo seed: global role "${name}" missing — run rbac first`)
  return row.id as string
}

async function permissionId(name: string): Promise<string> {
  const row = await db.from('permissions').where('name', name).select('id').first()
  if (!row) throw new Error(`Demo seed: permission "${name}" missing — run rbac first`)
  return row.id as string
}

export const organizationsModule: DemoSeedModule = {
  id: 'organizations',
  ownedTables: [
    'organizations',
    'organization_members',
    'organization_invitations',
    'organization_role_permissions',
    'user_roles',
    'authorization_audits',
  ],
  dependsOn: ['identities', 'rbac'],
  async seed(ctx) {
    const ownerRole = await globalRoleId('owner')
    const adminRole = await globalRoleId('admin')
    const agentRole = await globalRoleId('agent')
    const viewerRole = await globalRoleId('viewer')
    const superadminRole = await globalRoleId('superadmin')

    ctx.globalRoles = {
      owner: ownerRole,
      admin: adminRole,
      agent: agentRole,
      viewer: viewerRole,
      superadmin: superadminRole,
    }

    for (const key of ['northstar', 'harbor'] as const) {
      const org = DEMO_ORGS[key]
      await upsertById('organizations', FIXTURE_IDS.orgs[key], {
        name: org.name,
        slug: org.slug,
        email: org.email,
        phone: key === 'northstar' ? '+919876543210' : '+12125550100',
        website: key === 'northstar' ? 'https://northstar.demo' : 'https://harbor.demo',
        industry: org.industry,
        country: org.country,
        timezone: org.timezone,
        currency: org.currency,
        status: true,
        deletedAt: null,
      })
    }

    ctx.orgs = { ...FIXTURE_IDS.orgs }

    await upsertById('user_roles', FIXTURE_IDS.userRoles.superadmin, {
      userId: FIXTURE_IDS.users.superadmin,
      roleId: superadminRole,
      organizationId: null,
      permissionVersion: 1,
    })

    await upsertById('roles', FIXTURE_IDS.customRoles.northstarSupportLead, {
      name: 'support_lead',
      organizationId: FIXTURE_IDS.orgs.northstar,
    })
    ctx.customRoles = {
      northstarSupportLead: FIXTURE_IDS.customRoles.northstarSupportLead,
    }

    const supportPerms = [
      PERMISSIONS.INBOX_VIEW,
      PERMISSIONS.INBOX_REPLY,
      PERMISSIONS.INBOX_ASSIGN,
      PERMISSIONS.CONTACTS_VIEW,
      PERMISSIONS.TEMPLATES_VIEW,
      PERMISSIONS.TEAM_VIEW,
      PERMISSIONS.ORG_VIEW,
    ]
    await db
      .from('role_permissions')
      .where('roleId', FIXTURE_IDS.customRoles.northstarSupportLead)
      .delete()
    for (const perm of supportPerms) {
      await db.table('role_permissions').insert({
        roleId: FIXTURE_IDS.customRoles.northstarSupportLead,
        permissionId: await permissionId(perm),
      })
    }

    const members = [
      {
        memberId: FIXTURE_IDS.members.northstarOwner,
        userRoleId: FIXTURE_IDS.userRoles.northstarOwner,
        userId: FIXTURE_IDS.users.northstarOwner,
        roleId: ownerRole,
        orgId: FIXTURE_IDS.orgs.northstar,
      },
      {
        memberId: FIXTURE_IDS.members.northstarAdmin,
        userRoleId: FIXTURE_IDS.userRoles.northstarAdmin,
        userId: FIXTURE_IDS.users.northstarAdmin,
        roleId: adminRole,
        orgId: FIXTURE_IDS.orgs.northstar,
      },
      {
        memberId: FIXTURE_IDS.members.northstarAgent,
        userRoleId: FIXTURE_IDS.userRoles.northstarAgent,
        userId: FIXTURE_IDS.users.northstarAgent,
        roleId: agentRole,
        orgId: FIXTURE_IDS.orgs.northstar,
      },
      {
        memberId: FIXTURE_IDS.members.northstarViewer,
        userRoleId: FIXTURE_IDS.userRoles.northstarViewer,
        userId: FIXTURE_IDS.users.northstarViewer,
        roleId: viewerRole,
        orgId: FIXTURE_IDS.orgs.northstar,
      },
      {
        memberId: FIXTURE_IDS.members.northstarSupport,
        userRoleId: FIXTURE_IDS.userRoles.northstarSupport,
        userId: FIXTURE_IDS.users.northstarSupport,
        roleId: FIXTURE_IDS.customRoles.northstarSupportLead,
        orgId: FIXTURE_IDS.orgs.northstar,
      },
      {
        memberId: FIXTURE_IDS.members.harborOwner,
        userRoleId: FIXTURE_IDS.userRoles.harborOwner,
        userId: FIXTURE_IDS.users.harborOwner,
        roleId: ownerRole,
        orgId: FIXTURE_IDS.orgs.harbor,
      },
      {
        memberId: FIXTURE_IDS.members.harborAdmin,
        userRoleId: FIXTURE_IDS.userRoles.harborAdmin,
        userId: FIXTURE_IDS.users.harborAdmin,
        roleId: adminRole,
        orgId: FIXTURE_IDS.orgs.harbor,
      },
      {
        memberId: FIXTURE_IDS.members.harborAgent,
        userRoleId: FIXTURE_IDS.userRoles.harborAgent,
        userId: FIXTURE_IDS.users.harborAgent,
        roleId: agentRole,
        orgId: FIXTURE_IDS.orgs.harbor,
      },
      {
        memberId: FIXTURE_IDS.members.harborViewer,
        userRoleId: FIXTURE_IDS.userRoles.harborViewer,
        userId: FIXTURE_IDS.users.harborViewer,
        roleId: viewerRole,
        orgId: FIXTURE_IDS.orgs.harbor,
      },
    ]

    for (const m of members) {
      await upsertById('organization_members', m.memberId, {
        organizationId: m.orgId,
        userId: m.userId,
        roleId: m.roleId,
        permissionVersion: 1,
        isDeleted: false,
        deletedAt: null,
      })
      await upsertById('user_roles', m.userRoleId, {
        userId: m.userId,
        roleId: m.roleId,
        organizationId: m.orgId,
        permissionVersion: 1,
      })
    }

    const campaignsLaunch = await permissionId(PERMISSIONS.CAMPAIGNS_LAUNCH)
    const inboxAssign = await permissionId(PERMISSIONS.INBOX_ASSIGN)

    await upsertById(
      'organization_role_permissions',
      FIXTURE_IDS.overrides.northstarAdminCampaignsLaunch,
      {
        organizationId: FIXTURE_IDS.orgs.northstar,
        roleId: adminRole,
        permissionId: campaignsLaunch,
        granted: false,
      }
    )

    await upsertById(
      'organization_role_permissions',
      FIXTURE_IDS.overrides.northstarAgentInboxAssign,
      {
        organizationId: FIXTURE_IDS.orgs.northstar,
        roleId: agentRole,
        permissionId: inboxAssign,
        granted: false,
      }
    )

    await upsertById('organization_invitations', FIXTURE_IDS.invitations.northstarPending, {
      organizationId: FIXTURE_IDS.orgs.northstar,
      roleId: agentRole,
      inviterId: FIXTURE_IDS.users.northstarOwner,
      email: DEMO_USERS.northstarInvitee,
      status: 'pending',
      expiresAt: daysFromNow(7),
    })

    await upsertById('authorization_audits', FIXTURE_IDS.audits.northstarRoleOverride, {
      organizationId: FIXTURE_IDS.orgs.northstar,
      roleId: adminRole,
      permissionId: campaignsLaunch,
      actorUserId: FIXTURE_IDS.users.northstarOwner,
      targetType: 'role',
      targetId: adminRole,
      eventType: 'role.permission_override',
      granted: false,
      before: null,
      after: jsonb({ permission: PERMISSIONS.CAMPAIGNS_LAUNCH, granted: false }),
      reason: 'Demo seed: restrict admin campaign launch',
    })

    await upsertById('authorization_audits', FIXTURE_IDS.audits.northstarInviteCreated, {
      organizationId: FIXTURE_IDS.orgs.northstar,
      roleId: agentRole,
      permissionId: null,
      actorUserId: FIXTURE_IDS.users.northstarOwner,
      targetType: 'invitation',
      targetId: FIXTURE_IDS.invitations.northstarPending,
      eventType: 'invitation.created',
      granted: null,
      before: null,
      after: jsonb({ email: DEMO_USERS.northstarInvitee, role: 'agent' }),
      reason: 'Demo seed pending invitation',
    })

    // Bind demo sessions to their org now that organizations exist (FK).
    const sessionOrgByUserPrefix: Array<{ prefix: string; orgId: string }> = [
      { prefix: 'northstar', orgId: FIXTURE_IDS.orgs.northstar },
      { prefix: 'harbor', orgId: FIXTURE_IDS.orgs.harbor },
    ]
    for (const { prefix, orgId } of sessionOrgByUserPrefix) {
      const userIds = Object.entries(FIXTURE_IDS.users)
        .filter(([key]) => key.startsWith(prefix))
        .map(([, id]) => id)
      if (userIds.length > 0) {
        await db.from('sessions').whereIn('userId', userIds).update({
          activeOrganizationId: orgId,
        })
      }
    }
  },
}
