import { Suspense } from 'react'
import AddAssetPage from '@/components/AddAssetPage'

export default function AddPage() {
  return (
    <Suspense>
      <AddAssetPage company="balanced-comfort" />
    </Suspense>
  )
}
