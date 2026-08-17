import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const appDir = path.join(frontendRoot, 'app')
const nextDir = path.join(frontendRoot, '.next')
const cacheDir = path.join(frontendRoot, '.dev-cache')
const fingerprintFile = path.join(cacheDir, 'route-fingerprint.txt')
const manifestFile = path.join(nextDir, 'dev', 'server', 'app-paths-manifest.json')
const force = process.argv.includes('--force')

function listDirs(dir) {
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true }).filter((entry) => entry.isDirectory())
}

function walkPages(dir, acc = []) {
  if (!existsSync(dir)) return acc
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walkPages(full, acc)
      continue
    }
    if (/^page\.(t|j)sx?$/.test(entry.name)) {
      acc.push(path.relative(appDir, full).split(path.sep).join('/'))
    }
  }
  return acc
}

function dirHasFiles(dir) {
  if (!existsSync(dir)) return false
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isFile()) return true
    if (entry.isDirectory() && dirHasFiles(full)) return true
  }
  return false
}

/**
 * Next.js 16.2 does not reliably register auth pages inside a `(auth)` route
 * group. After a git pull, Windows can also leave that empty folder behind.
 * Remove it when flattened `/login` (etc.) pages already exist, or when empty.
 */
function removeLeftoverAuthGroup(dir) {
  for (const entry of listDirs(dir)) {
    const full = path.join(dir, entry.name)
    if (entry.name === '(auth)') {
      const siblingLogin = path.join(dir, 'login', 'page.tsx')
      const siblingLoginJs = path.join(dir, 'login', 'page.ts')
      const hasFlattenedLogin = existsSync(siblingLogin) || existsSync(siblingLoginJs)
      if (hasFlattenedLogin || !dirHasFiles(full)) {
        rmSync(full, { recursive: true, force: true })
        console.log('Removed leftover app route group:', path.relative(frontendRoot, full))
      }
      continue
    }
    removeLeftoverAuthGroup(full)
  }
}

removeLeftoverAuthGroup(appDir)

const pages = walkPages(appDir).sort()
const fingerprint = `${pages.join('\n')}\n`
const hasLoginPage = pages.some((page) => page === '[locale]/login/page.tsx' || page === '[locale]/login/page.ts')

let shouldClean = force
if (existsSync(nextDir)) {
  const previous = existsSync(fingerprintFile) ? readFileSync(fingerprintFile, 'utf8') : ''
  if (previous !== fingerprint) {
    shouldClean = true
    console.log('Route files changed since last dev run; clearing .next cache.')
  }

  if (!shouldClean && existsSync(manifestFile) && hasLoginPage) {
    const manifest = readFileSync(manifestFile, 'utf8')
    if (!manifest.includes('/[locale]/login/page')) {
      shouldClean = true
      console.log('Dev cache is missing the login route; clearing .next cache.')
    }
  }
}

if (shouldClean && existsSync(nextDir)) {
  rmSync(nextDir, { recursive: true, force: true })
  console.log('Cleared apps/frontend/.next')
}

mkdirSync(cacheDir, { recursive: true })
writeFileSync(fingerprintFile, fingerprint)
