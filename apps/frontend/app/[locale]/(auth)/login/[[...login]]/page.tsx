import { LoginForm } from '@/components/auth/login-form'
import { AuthShell } from '@/components/auth/auth-shell'

export default function LoginPage() {
  return (
    <AuthShell
      panelTitle="Welcome back to Whats-Auto"
      panelSubtitle="Sign in to manage broadcasts, chatbots, and customer conversations."
    >
      <LoginForm />
    </AuthShell>
  )
}
