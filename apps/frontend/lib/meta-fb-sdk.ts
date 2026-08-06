/**
 * Minimal Facebook JS SDK loader for WhatsApp Embedded Signup.
 * Session config (appId / configId / graphVersion) comes from the backend.
 */

export type FacebookAuthResponse = {
  code?: string
  accessToken?: string
  userID?: string
  expiresIn?: number
}

export type FacebookLoginResponse = {
  authResponse?: FacebookAuthResponse | null
  status?: string
}

export type FacebookLoginOptions = {
  config_id: string
  response_type: 'code'
  override_default_response_type: boolean
  extras?: {
    setup?: Record<string, unknown>
    featureType?: string
    sessionInfoVersion?: string
  }
}

type FacebookSdk = {
  init: (params: {
    appId: string
    cookie?: boolean
    xfbml?: boolean
    version: string
  }) => void
  login: (
    callback: (response: FacebookLoginResponse) => void,
    options: FacebookLoginOptions
  ) => void
}

declare global {
  interface Window {
    FB?: FacebookSdk
    fbAsyncInit?: () => void
  }
}

let sdkPromise: Promise<FacebookSdk> | null = null

function normalizeGraphVersion(version: string) {
  return version.startsWith('v') ? version : `v${version}`
}

export function loadFacebookSdk(params: {
  appId: string
  graphVersion: string
}): Promise<FacebookSdk> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Facebook SDK is only available in the browser'))
  }

  if (window.FB) {
    return Promise.resolve(window.FB)
  }

  if (sdkPromise) return sdkPromise

  sdkPromise = new Promise<FacebookSdk>((resolve, reject) => {
    const version = normalizeGraphVersion(params.graphVersion)

    window.fbAsyncInit = () => {
      try {
        window.FB!.init({
          appId: params.appId,
          cookie: true,
          xfbml: false,
          version,
        })
        resolve(window.FB!)
      } catch (error) {
        sdkPromise = null
        reject(error)
      }
    }

    const existing = document.getElementById('facebook-jssdk')
    if (existing) return

    const script = document.createElement('script')
    script.id = 'facebook-jssdk'
    script.async = true
    script.defer = true
    script.crossOrigin = 'anonymous'
    script.src = 'https://connect.facebook.net/en_US/sdk.js'
    script.onerror = () => {
      sdkPromise = null
      reject(new Error('Failed to load Facebook SDK'))
    }
    document.body.appendChild(script)
  })

  return sdkPromise
}

export type EmbeddedSignupSessionInfo = {
  phone_number_id?: string
  waba_id?: string
  business_id?: string
}

export type EmbeddedSignupMessage = {
  type?: string
  event?: string
  data?: EmbeddedSignupSessionInfo
}

export function parseEmbeddedSignupMessage(raw: unknown): EmbeddedSignupMessage | null {
  if (typeof raw !== 'string') return null
  try {
    const parsed = JSON.parse(raw) as EmbeddedSignupMessage
    if (parsed?.type !== 'WA_EMBEDDED_SIGNUP') return null
    return parsed
  } catch {
    return null
  }
}
