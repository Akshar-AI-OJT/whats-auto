import { betterAuth } from 'better-auth'

const googleClientId = process.env.GOOGLE_CLIENT_ID
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET

const hasGoogleOAuth =
  Boolean(googleClientId) &&
  Boolean(googleClientSecret) &&
  !googleClientId!.startsWith('<')

export const auth = betterAuth({
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
