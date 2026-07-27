export default function PrivacyLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return <div className="w-full flex-1">{children}</div>
}
