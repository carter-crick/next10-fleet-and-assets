import AssetDetailPage from '@/components/AssetDetailPage'

export default async function AssetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <AssetDetailPage company="sailors-air" id={id} />
}
