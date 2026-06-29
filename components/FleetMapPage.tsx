'use client'

import dynamic from 'next/dynamic'
import CompanyNav from './CompanyNav'
import type { Company } from '@/lib/types'

// Leaflet must never run on the server — dynamic import with ssr:false is required
const FleetMapInner = dynamic(() => import('./FleetMapInner'), {
  ssr: false,
  loading: () => (
    <div className="flex-1 flex items-center justify-center">
      <p className="text-sm text-gray-400">Loading map…</p>
    </div>
  ),
})

export default function FleetMapPage({ company }: { company: Company }) {
  const companyColor = company === 'balanced-comfort' ? '#002D5B' : '#0f766e'

  return (
    <div className="h-screen flex flex-col">
      <CompanyNav company={company} />
      <div className="flex-1 overflow-hidden">
        <FleetMapInner company={company} companyColor={companyColor} />
      </div>
    </div>
  )
}
