/**
 * Runs before `next dev`. Two jobs:
 * 1. Drop leftover `app/[locale]/(auth)` — Next.js 16 webpack on Windows
 *    does not register that route group, so /en/login 404s after a pull.
 * 2. Wipe `.next` when App Router files change, so a stale route manifest
 *    cannot keep serving 404 after git pull.
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'

const root = process.cwd()
const appDir = join(root, 'app')
const nextDir = join(root, '.next')
const stampFile = join(root, '.next-route-fingerprint')
const authGroupDir = join(appDir, '[locale]', '(auth)')
const localeDir = join(appDir, '[locale]')
const AUTH_ROUTES = ['login', 'register', 'forgot-password', 'reset-password']
const force = process.argv.includes('--force-clean')

function listRouteFiles(dir, acc = []) {
  if (!existsSync(dir)) return acc
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      listRouteFiles(full, acc)
      continue
    }
    if (/^(page|layout|route|proxy|middleware)\.(tsx|ts|jsx|js)$/.test(entry.name)) {
      acc.push(relative(root, full).replaceAll('\\', '/'))
    }
  }
  return acc
}

function flattenAuthGroup() {
  if (!existsSync(authGroupDir)) return false

  let moved = false
  for (const name of AUTH_ROUTES) {
    const from = join(authGroupDir, name, 'page.tsx')
    const toDir = join(localeDir, name)
    const to = join(toDir, 'page.tsx')
    if (!existsSync(from)) continue
    if (!existsSync(to)) {
      mkdirSync(toDir, { recursive: true })
      writeFileSync(to, readFileSync(from))
      moved = true
    }
  }

  rmSync(authGroupDir, { recursive: true, force: true })
  return moved
}

const flattened = flattenAuthGroup()
const files = listRouteFiles(appDir).concat(['proxy.ts', 'middleware.ts'].filter((name) => existsSync(join(root, name)))).sort()
const fingerprint = createHash('sha1').update(files.join('\n')).digest('hex')

let previous = ''
try {
  previous = readFileSync(stampFile, 'utf8').trim()
} catch {
  previous = ''
}

const staleCache = existsSync(nextDir) && (force || flattened || !previous || previous !== fingerprint)
if (staleCache) {
  rmSync(nextDir, { recursive: true, force: true })
}

writeFileSync(stampFile, `${fingerprint}\n`)
if (flattened) {
  console.log('[prepare-dev] Flattened (auth) route group so /login registers on Windows.')
}
if (staleCache) {
  console.log('[prepare-dev] Cleared .next after route-file change.')
}
