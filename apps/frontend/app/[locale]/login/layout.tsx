export default function AuthRouteLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Height / background come from AuthSplitLayout so mobile stays full-bleed white.
  return <div className="light-locked auth-palette w-full">{children}</div>
}
