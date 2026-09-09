export default function AuthRouteLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <div className="light-locked auth-palette w-full">{children}</div>
}
