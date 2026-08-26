/**
 * Reads apps/backend/.env and checks Razorpay API auth + Subscriptions access.
 * Customers 200 + Plans 401 usually means Subscriptions product is not enabled.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const envPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.env')
const text = fs.readFileSync(envPath, 'utf8')
const env = {}
for (const line of text.split(/\r?\n/)) {
  if (!line || line.startsWith('#') || !line.includes('=')) continue
  const i = line.indexOf('=')
  env[line.slice(0, i).trim()] = line.slice(i + 1).trim()
}

function stripQuotes(v) {
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    return v.slice(1, -1)
  }
  return v
}

const keyId = stripQuotes(env.RAZORPAY_KEY_ID || '')
const keySecret = stripQuotes(env.RAZORPAY_KEY_SECRET || '')

console.log(
  JSON.stringify(
    {
      keyIdPrefix: keyId.slice(0, 8),
      keyIdSuffix: keyId.slice(-4),
      mode: keyId.startsWith('rzp_test_')
        ? 'test'
        : keyId.startsWith('rzp_live_')
          ? 'live'
          : 'unknown',
      secretLen: keySecret.length,
    },
    null,
    2
  )
)

const auth = Buffer.from(`${keyId}:${keySecret}`).toString('base64')
const headers = {
  Authorization: `Basic ${auth}`,
  Accept: 'application/json',
  'Content-Type': 'application/json',
}

async function get(pathName) {
  const res = await fetch(`https://api.razorpay.com/v1${pathName}`, { headers })
  const body = (await res.text()).slice(0, 200)
  console.log(`GET  ${pathName} -> ${res.status}`, body)
  return res.status
}

const customers = await get('/customers?count=1')
const plans = await get('/plans?count=1')
const subscriptions = await get('/subscriptions?count=1')

console.log('\n---')
if (customers === 401) {
  console.log('FAIL: Key Id + Secret are invalid (or mismatched). Regenerate API Keys.')
} else if (plans === 401 || subscriptions === 401) {
  console.log(
    'Keys are VALID, but this Razorpay account cannot use Plans/Subscriptions (401).'
  )
  console.log(
    'Enable Subscriptions in that Razorpay dashboard (or use an account with Subscriptions), then retry checkout.'
  )
} else {
  console.log('OK: auth + Subscriptions access look good. Restart backend and retry checkout.')
}
