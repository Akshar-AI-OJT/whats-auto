import app from '@adonisjs/core/services/app'
import { defineConfig } from '@adonisjs/lucid'
import env from '#start/env'

const dbConfig = defineConfig({
  /**
   * Default connection used for all queries.
   */
  connection: 'pg',

  connections: {
    /**
     * SQLite connection (default).
     */
    // sqlite: {
    //   client: 'better-sqlite3',

    //   connection: {
    //     filename: app.tmpPath('db.sqlite3'),
    //   },

    //   /**
    //    * Required by Knex for SQLite defaults.
    //    */
    //   useNullAsDefault: true,

    //   migrations: {
    //     /**
    //      * Sort migration files naturally by filename.
    //      */
    //     naturalSort: true,

    //     /**
    //      * Paths containing migration files.
    //      */
    //     paths: ['database/migrations'],
    //   },

    //   schemaGeneration: {
    //     /**
    //      * Enable schema generation from Lucid models.
    //      */
    //     enabled: true,

    //     /**
    //      * Custom schema rules file paths.
    //      */
    //     rulesPaths: ['./database/schema_rules.js'],
    //   },
    // },

    /**
     * PostgreSQL connection.
     * Install package to switch: npm install pg
     */
    pg: {
      client: 'pg',
      connection: {
        host: env.get('PG_HOST'),
        port: Number(env.get('PG_PORT') || 5432),
        user: env.get('PG_USER'),
        password: env.get('PG_PASSWORD').release(),
        database: env.get('PG_DB_NAME'),
        ssl: env.get('PG_SSL') ? { rejectUnauthorized: false } : false,
        // @ts-expect-error Lucid PostgresConnectionNode omits node-pg keepAlive
        keepAlive: true,
        keepAliveInitialDelayMillis: 10_000,
      },

      pool: {
        min: 0,
        max: 10,
        // Recycle before typical AWS/NAT idle drop (~350s)
        idleTimeoutMillis: 20000,
        createTimeoutMillis: 30000,
        acquireTimeoutMillis: 30000,
      },
      migrations: {
        naturalSort: true,
        paths: ['database/migrations'],
      },
      debug: app.inDev,
    },
  },
})

export default dbConfig
