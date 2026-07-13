import app from '@adonisjs/core/services/app'
import { defineConfig } from '@adonisjs/lucid'

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
        host: process.env.PG_HOST,
        port: Number(process.env.PG_PORT || 5432),
        user: process.env.PG_USER,
        password: process.env.PG_PASSWORD,
        database: process.env.PG_DB_NAME,
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
