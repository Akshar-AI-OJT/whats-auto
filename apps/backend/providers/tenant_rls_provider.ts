import type { ApplicationService } from '@adonisjs/core/types'
import db from '@adonisjs/lucid/services/db'
import { getTenantOrganizationId } from '#services/tenant_context'

/**
 * Stamps PostgreSQL `app.current_organization_id` on every pooled connection
 * acquire/release using the request's AsyncLocalStorage tenant.
 *
 * Why: session-level set_config on a random pooled query does not survive
 * (wrong connection). Wrapping the whole HTTP request in one transaction
 * breaks when services open nested `db.transaction()` on a new connection.
 * Setting the GUC on acquire (and clearing on release) keeps RLS correct
 * for both plain queries and nested transactions without holding a request
 * transaction open.
 */
export default class TenantRlsProvider {
  constructor(protected app: ApplicationService) {}

  async start() {
    // Do not patch the pool for Ace/console — migration advisory locks
    // and one-shot CLI connections break if acquire/release is wrapped.
    const environment = this.app.getEnvironment()
    if (environment !== 'web' && environment !== 'test') {
      return
    }

    const connectionName = db.primaryConnectionName
    const node = db.getRawConnection(connectionName)
    if (!node) {
      return
    }

    // Ace / early boot may not have opened the pool yet.
    if (!node.connection?.ready) {
      db.manager.connect(connectionName)
    }

    const connection = db.getRawConnection(connectionName)?.connection
    const knex = connection?.client
    if (!knex?.client) {
      connection?.on('connect', () => this.patchKnexClient(connection.client))
      return
    }

    this.patchKnexClient(knex)
  }

  private patchKnexClient(knex: { client?: KnexClient } | undefined) {
    if (!knex?.client || knex.client.__tenantRlsPatched) {
      return
    }

    const client = knex.client
    const originalAcquire = client.acquireConnection.bind(client)
    const originalRelease = client.releaseConnection.bind(client)

    client.acquireConnection = async () => {
      const pgConnection = await originalAcquire()
      const orgId = getTenantOrganizationId() ?? ''
      await querySetConfig(pgConnection, orgId)
      return pgConnection
    }

    client.releaseConnection = async (pgConnection: PgConnection) => {
      try {
        await querySetConfig(pgConnection, '')
      } catch {
        // Always return the connection to the pool.
      }
      return originalRelease(pgConnection)
    }

    client.__tenantRlsPatched = true
  }
}

type PgConnection = {
  query: (text: string, values: unknown[], callback: (err: Error | null) => void) => void
}

type KnexClient = {
  acquireConnection: () => Promise<PgConnection>
  releaseConnection: (connection: PgConnection) => Promise<void> | void
  __tenantRlsPatched?: boolean
}

function querySetConfig(connection: PgConnection, organizationId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    connection.query(
      `SELECT set_config('app.current_organization_id', $1, false)`,
      [organizationId],
      (err) => {
        if (err) reject(err)
        else resolve()
      }
    )
  })
}
