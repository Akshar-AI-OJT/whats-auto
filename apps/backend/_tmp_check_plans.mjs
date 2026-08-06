import fs from 'fs'
import pg from 'pg'

const envPath = process.argv[2]
const env = Object.fromEntries(
  fs.readFileSync(envPath, 'utf8')
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]
    })
)

const sslRaw = (env.PG_SSL || '').toLowerCase()
const useSsl = sslRaw === 'true' || sslRaw === '1' || sslRaw === 'require'

const c = new pg.Client({
  host: env.PG_HOST,
  port: Number(env.PG_PORT || 5432),
  user: env.PG_USER,
  password: env.PG_PASSWORD,
  database: env.PG_DB_NAME,
  ssl: useSsl ? { rejectUnauthorized: false } : false,
})
await c.connect()
const r = await c.query('SELECT id, name, code FROM plans ORDER BY name, code')
console.table(r.rows)
await c.end()
