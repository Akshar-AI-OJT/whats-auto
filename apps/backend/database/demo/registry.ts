import type { ApplicationTable, DemoSeedModule, DemoSeedContext } from '#database/demo/types'
import { APPLICATION_TABLES } from '#database/demo/types'
import { FIXTURE_IDS } from '#database/demo/fixture_ids'
import { plansModule } from '#database/demo/modules/plans'
import { identitiesModule } from '#database/demo/modules/identities'
import { organizationsModule } from '#database/demo/modules/organizations'
import { contactsModule } from '#database/demo/modules/contacts'
import { whatsappConfigsModule } from '#database/demo/modules/whatsapp_configs'
import { mediaAssetsModule } from '#database/demo/modules/media_assets'
import { messageTemplatesModule } from '#database/demo/modules/message_templates'
import { inboxModule } from '#database/demo/modules/inbox'
import { billingModule } from '#database/demo/modules/billing'

/** RBAC catalog ownership — executed by demo_seeder via existing rbac_seeder. */
export const rbacModuleMeta: Pick<DemoSeedModule, 'id' | 'ownedTables' | 'dependsOn'> = {
  id: 'rbac',
  ownedTables: ['roles', 'permissions', 'role_permissions'],
  dependsOn: [],
}

/**
 * Ordered demo modules (after rbac).
 * Add new tables by appending/extending a module here and updating demo_seed_plan.md.
 */
export const DEMO_MODULES: DemoSeedModule[] = [
  plansModule,
  identitiesModule,
  organizationsModule,
  contactsModule,
  whatsappConfigsModule,
  mediaAssetsModule,
  messageTemplatesModule,
  inboxModule,
  billingModule,
]

export function createDemoSeedContext(): DemoSeedContext {
  return {
    plans: { ...FIXTURE_IDS.plans },
    orgs: { ...FIXTURE_IDS.orgs },
    users: {},
    globalRoles: {},
    customRoles: { northstarSupportLead: FIXTURE_IDS.customRoles.northstarSupportLead },
    whatsappConfigs: { ...FIXTURE_IDS.whatsappConfigs },
    contacts: {},
    conversations: {},
    mediaAssets: {},
    templates: {},
    subscriptions: { ...FIXTURE_IDS.subscriptions },
  }
}

/** All tables claimed by rbac meta + demo modules (exactly once). */
export function ownedTablesByModule(): Map<string, ApplicationTable[]> {
  const map = new Map<string, ApplicationTable[]>()
  map.set(rbacModuleMeta.id, [...rbacModuleMeta.ownedTables])
  for (const mod of DEMO_MODULES) {
    map.set(mod.id, [...mod.ownedTables])
  }
  return map
}

export function allOwnedTables(): ApplicationTable[] {
  const tables: ApplicationTable[] = []
  for (const list of ownedTablesByModule().values()) {
    tables.push(...list)
  }
  return tables
}

export function assertRegistryCoverage(): void {
  const owned = allOwnedTables()
  const seen = new Set<string>()
  const duplicates: string[] = []
  for (const table of owned) {
    if (seen.has(table)) duplicates.push(table)
    seen.add(table)
  }
  if (duplicates.length > 0) {
    throw new Error(`Demo seed registry: duplicate table ownership: ${duplicates.join(', ')}`)
  }

  const missing = APPLICATION_TABLES.filter((t) => !seen.has(t))
  const extra = [...seen].filter((t) => !(APPLICATION_TABLES as readonly string[]).includes(t))

  if (missing.length > 0 || extra.length > 0) {
    throw new Error(
      `Demo seed registry coverage mismatch.\nMissing: ${missing.join(', ') || '(none)'}\nExtra: ${extra.join(', ') || '(none)'}`
    )
  }
}
