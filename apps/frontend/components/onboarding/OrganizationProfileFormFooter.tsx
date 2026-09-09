export function OrganizationProfileFormFooter({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="mt-8 flex flex-col-reverse gap-3 border-t border-[#E2E8F0] pt-5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      {children}
    </div>
  )
}
