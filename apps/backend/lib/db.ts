import { Pool } from 'pg'
import env from '#start/env'

const useSsl = env.get('PG_SSL')

export const pool = new Pool({
  host: env.get('PG_HOST'),
  port: env.get('PG_PORT'),
  user: env.get('PG_USER'),
  password: env.get('PG_PASSWORD').release(),
  database: env.get('PG_DB_NAME'),
  // Match Lucid config/database.ts — RDS staging/prod require SSL.
  ssl: useSsl ? { rejectUnauthorized: false } : undefined,
})
