import { AcceptInvitationPage } from '@/components/invite/AcceptInvitationPage'
import type { InvitationPreview } from '@/lib/api'

type PageProps = {
  params: Promise<{ id: string }>
}

function unwrapPreview(data: unknown): InvitationPreview | null {
  if (!data || typeof data !== 'object') return null
  const body = data as { data?: InvitationPreview } & Partial<InvitationPreview>
  const preview = body.data ?? (body.id ? (body as InvitationPreview) : null)
  return preview?.id ? preview : null
}

async function loadInvitationPreview(id: string): Promise<{
  preview: InvitationPreview | null
  errorKey: 'notFound' | 'loadFailed' | null
}> {
  // Prefer the API origin. Local fallback is the Next app (dev rewrite).
  const base = (
    process.env.NEXT_PUBLIC_API_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    'http://localhost:3000'
  ).replace(/\/$/, '')

  try {
    const response = await fetch(`${base}/api/v1/invitations/${id}`, {
      method: 'GET',
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    })

    if (response.status === 404) {
      return { preview: null, errorKey: 'notFound' }
    }

    if (!response.ok) {
      return { preview: null, errorKey: 'loadFailed' }
    }

    const json = (await response.json()) as unknown
    const preview = unwrapPreview(json)
    if (!preview) {
      return { preview: null, errorKey: 'notFound' }
    }

    return { preview, errorKey: null }
  } catch {
    return { preview: null, errorKey: 'loadFailed' }
  }
}

export default async function AcceptInvitationRoute({ params }: PageProps) {
  const { id } = await params
  const { preview, errorKey } = await loadInvitationPreview(id)

  return (
    <AcceptInvitationPage
      invitationId={id}
      initialPreview={preview}
      initialErrorKey={errorKey}
    />
  )
}
