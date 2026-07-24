import { LoginForm } from '@/components/auth/login-form'
import { AuthLayout } from '@/components/auth/auth-layout'
import { AuthBranding } from '@/components/auth/auth-branding'

export default function LoginPage() {
  return (
    <AuthLayout branding={<AuthBranding variant="login" />}>
      <LoginForm />
    </AuthLayout>
  )
}
