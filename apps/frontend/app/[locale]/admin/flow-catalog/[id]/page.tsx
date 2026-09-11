import { FlowEditorPage } from '@/components/dashboard/flows/FlowEditorPage'

export default async function AdminFlowCatalogEditorRoute({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return <FlowEditorPage flowId={id} mode="catalog" />
}
