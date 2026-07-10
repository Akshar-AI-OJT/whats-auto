import { betterAuth } from 'better-auth'
import Database from 'better-sqlite3'
import path from 'path'

const googleClientId = process.env.GOOGLE_CLIENT_ID
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET

const hasGoogleOAuth =
  Boolean(googleClientId) &&
  Boolean(googleClientSecret) &&
  !googleClientId!.startsWith('<')

const dbPath = path.join(process.cwd(), '../backend/tmp/db.sqlite3')

export const auth = betterAuth({
  database: new Database(dbPath),
  baseURL: process.env.NEXT_PUBLIC_APP_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  ...(hasGoogleOAuth
    ? {
        socialProviders: {
          google: {
            clientId: googleClientId!,
            clientSecret: googleClientSecret!,
          },
        },
      }
    : {}),
})
