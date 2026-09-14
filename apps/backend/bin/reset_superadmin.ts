/*
|--------------------------------------------------------------------------
| Reset platform superadmin (ops script)
|--------------------------------------------------------------------------
|
| Deletes the SUPERADMIN_EMAIL user (org memberships, sessions, etc.)
| and bootstraps a fresh platform superadmin account.
|
|   node bin/reset_superadmin.js
|   node bin/reset_superadmin.js --email=you@example.com
|
*/

await import('reflect-metadata')
const { Ignitor, prettyPrintError } = await import('@adonisjs/core')

const APP_ROOT = new URL('../', import.meta.url)

const IMPORTER = (filePath: string) => {
  if (filePath.startsWith('./') || filePath.startsWith('../')) {
    return import(new URL(filePath, APP_ROOT).href)
  }
  return import(filePath)
}

function parseArgs(argv: string[]) {
  let email: string | undefined

  for (const arg of argv) {
    if (arg.startsWith('--email=')) {
      email = arg.slice('--email='.length)
    }
  }

  return { email: email ?? process.env.SUPERADMIN_EMAIL }
}

try {
  const ignitor = new Ignitor(APP_ROOT, { importer: IMPORTER }).tap((app) => {
    app.booting(async () => {
      await import('#start/env')
    })
  })

  const app = ignitor.createApp('console')
  await app.init()
  await app.boot()

  const { resetSuperadminUser } = await import('#services/grant_superadmin_service')
  const result = await resetSuperadminUser(parseArgs(process.argv.slice(2)))

  if (result.level === 'success' || result.level === 'warning') {
    console.log(result.message)
  } else {
    console.error(result.message)
  }

  await app.terminate()
  process.exit(result.ok ? 0 : 1)
} catch (error) {
  process.exitCode = 1
  prettyPrintError(error)
}
