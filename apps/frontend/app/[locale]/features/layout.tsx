export default function FeaturesLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return <div className="flex flex-1 flex-col">{children}</div>
}
