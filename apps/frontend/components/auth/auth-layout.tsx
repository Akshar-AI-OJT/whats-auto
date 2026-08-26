import { AuthSplitLayout } from '@/components/auth/auth-split-layout'

/**
 * Shared auth page shell for Login, Register, OTP, Forgot, and Reset.
 * Pass a page-specific branding panel; chrome comes from AuthSplitLayout.
 */
export function AuthLayout({
  branding,
  children,
  className,
  showBrandLink = true,
  compact = false,
  contentClassName,
  wideForm = false,
}: {
  branding: React.ReactNode
  children: React.ReactNode
  className?: string
  showBrandLink?: boolean
  compact?: boolean
  contentClassName?: string
  wideForm?: boolean
}) {
  return (
    <AuthSplitLayout
      branding={branding}
      className={className}
      showBrandLink={showBrandLink}
      compact={compact}
      contentClassName={contentClassName}
      wideForm={wideForm}
    >
      {children}
    </AuthSplitLayout>
  )
}
