'use client'

/**
 * TEMPORARY — Embedded Signup smoke test from the dashboard KPI grid.
 * Remove once a real settings/WhatsApp connect page exists.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { api, type ApiError } from '@/lib/api'
import { Button } from '@/components/ui/button'

declare global {
  interface Window {
    fbAsyncInit?: () => void
    FB?: {
      init: (params: Record<string, unknown>) => void
      login: (
        callback: (response: { status?: string; authResponse?: { code?: string } }) => void,
        options: Record<string, unknown>
      ) => void
    }
  }
}

type SessionInfo = {
  phoneNumberId?: string
  wabaId?: string
  businessId?: string
}

type SdkSession = {
  appId: string
  configId: string
  graphVersion: string
}

export function ConnectWhatsAppButton() {
  const [status, setStatus] = useState<'idle' | 'loading' | 'connecting' | 'done' | 'error'>('idle')
  const [message, setMessage] = useState<string | null>(null)
  const sessionInfoRef = useRef<SessionInfo>({})
  const sdkRef = useRef<SdkSession | null>(null)

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (!event.origin?.endsWith('facebook.com')) return

      let data: {
        type?: string
        event?: string
        data?: {
          phone_number_id?: string
          waba_id?: string
          business_id?: string
          error_message?: string
        }
      }
      try {
        data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data
      } catch {
        return
      }
      if (data?.type !== 'WA_EMBEDDED_SIGNUP') return

      if (data.event === 'FINISH' && data.data) {
        sessionInfoRef.current = {
          phoneNumberId: data.data.phone_number_id,
          wabaId: data.data.waba_id,
          businessId: data.data.business_id,
        }
      } else if (data.event === 'ERROR') {
        setStatus('error')
        setMessage(data.data?.error_message ?? 'Meta Embedded Signup failed')
      }
    }

    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  const ensureSdk = useCallback(async () => {
    const { data } = await api.whatsapp.embeddedSignupSession()
    const session = data.data
    sdkRef.current = session

    if (window.FB) {
      window.FB.init({
        appId: session.appId,
        cookie: true,
        xfbml: true,
        version: session.graphVersion,
      })
      return session
    }

    await new Promise<void>((resolve, reject) => {
      window.fbAsyncInit = () => {
        try {
          window.FB?.init({
            appId: session.appId,
            cookie: true,
            xfbml: true,
            version: session.graphVersion,
          })
          resolve()
        } catch (error) {
          reject(error)
        }
      }

      if (document.getElementById('facebook-jssdk')) {
        if (window.FB) {
          window.FB.init({
            appId: session.appId,
            cookie: true,
            xfbml: true,
            version: session.graphVersion,
          })
          resolve()
        }
        return
      }

      const script = document.createElement('script')
      script.id = 'facebook-jssdk'
      script.src = 'https://connect.facebook.net/en_US/sdk.js'
      script.async = true
      script.defer = true
      script.onerror = () => reject(new Error('Failed to load Facebook SDK'))
      document.body.appendChild(script)
    })

    return session
  }, [])

  const launch = useCallback(async () => {
    setStatus('loading')
    setMessage(null)
    sessionInfoRef.current = {}

    try {
      const session = await ensureSdk()
      if (!window.FB) {
        setStatus('error')
        setMessage('Facebook SDK not available')
        return
      }

      setStatus('connecting')
      window.FB.login(
        (response) => {
          if (response.status !== 'connected' || !response.authResponse?.code) {
            setStatus('idle')
            setMessage('Signup cancelled or no code returned')
            return
          }

          const { phoneNumberId, wabaId, businessId } = sessionInfoRef.current
          if (!phoneNumberId || !wabaId) {
            setStatus('error')
            setMessage('Missing phone_number_id / waba_id from Meta FINISH event. Try again.')
            return
          }

          void (async () => {
            try {
              // Code TTL ~30s — call complete immediately.
              const { data } = await api.whatsapp.completeEmbeddedSignup({
                code: response.authResponse!.code!,
                wabaId,
                phoneNumberId,
                businessId,
              })
              setStatus('done')
              setMessage(`Connected (${data.data.status}) id=${data.data.id}`)
            } catch (error) {
              const apiError = error as ApiError
              setStatus('error')
              setMessage(`${apiError.message}${apiError.code ? ` [${apiError.code}]` : ''}`)
            }
          })()
        },
        {
          config_id: session.configId,
          response_type: 'code',
          override_default_response_type: true,
          extras: {
            setup: {},
            sessionInfoVersion: 3,
          },
        }
      )
    } catch (error) {
      const apiError = error as ApiError
      setStatus('error')
      setMessage(apiError.message ?? 'Failed to start Embedded Signup')
    }
  }, [ensureSdk])

  return (
    <div className="mt-3 flex flex-col gap-1.5">
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="w-full"
        disabled={status === 'loading' || status === 'connecting'}
        onClick={() => void launch()}
      >
        {status === 'connecting'
          ? 'Connecting…'
          : status === 'loading'
            ? 'Preparing…'
            : status === 'done'
              ? 'Connected'
              : 'Connect WhatsApp'}
      </Button>
      {message ? (
        <p
          className={`text-[11px] leading-4 ${status === 'error' ? 'text-negative' : 'text-mute'}`}
          role={status === 'error' ? 'alert' : undefined}
        >
          {message}
        </p>
      ) : (
        <p className="text-[11px] leading-4 text-mute">
          Temp ES test — login on ngrok URL, create org, set-active first
        </p>
      )}
    </div>
  )
}
