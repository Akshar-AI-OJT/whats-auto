import { InvoiceViewPage } from '@/components/admin/invoices/InvoiceViewPage'

type AdminInvoiceDetailRouteProps = {
  params: Promise<{ invoiceId: string }>
}

export default async function AdminInvoiceDetailRoute({ params }: AdminInvoiceDetailRouteProps) {
  const { invoiceId } = await params
  return <InvoiceViewPage invoiceId={invoiceId} />
}
