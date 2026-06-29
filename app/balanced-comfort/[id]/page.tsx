import AssetDetailPage from '@/components/AssetDetailPage'

export default async function AssetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <AssetDetailPage company="balanced-comfort" id={id} />
}
