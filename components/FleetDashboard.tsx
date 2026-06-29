'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import CompanyNav from './CompanyNav'
import StatusBadge from './StatusBadge'
import type { Asset, AssetType, Company } from '@/lib/types'

const TYPE_CONFIG: Record<AssetType, { label: string; icon: string }> = {
  vehicle:   { label: 'Vehicles',  icon: '🚛' },
  equipment: { label: 'Equipment', icon: '🔧' },
  trailer:   { label: 'Trailers',  icon: '🚚' },
}

function formatDate(dateStr: string) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

function daysUntil(dateStr: string) {
  const due = new Date(dateStr + 'T00:00:00')
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}

export default function FleetDashboard({ company }: { company: Company }) {
  const [assets, setAssets] = useState<Asset[]>([])
  const [loading, setLoading] = useState(true)

  const companyColor = company === 'balanced-comfort' ? '#002D5B' : '#0f766e'

  useEffect(() => {
    fetch(`/api/assets?company=${company}`)
      .then(r => r.json())
      .then(data => { setAssets(data); setLoading(false) })
  }, [company])

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <CompanyNav company={company} />
        <div className="flex items-center justify-center h-64">
          <p className="text-gray-400 text-sm">Loading...</p>
        </div>
      </div>
    )
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const in30Days = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000)

  const statsForType = (type: AssetType) => {
    const arr = assets.filter(a => a.type === type)
    const active = arr.filter(a => a.status === 'active').length
    const needsAttention = arr.filter(a => a.status === 'maintenance' || a.status === 'out-of-service').length
    const dueSoon = arr.filter(a => {
      if (!a.nextServiceDue) return false
      return new Date(a.nextServiceDue + 'T00:00:00') <= in30Days
    }).length
    return { total: arr.length, active, needsAttention, dueSoon }
  }

  const upcomingService = assets
    .filter(a => a.nextServiceDue && new Date(a.nextServiceDue + 'T00:00:00') <= in30Days)
    .sort((a, b) => a.nextServiceDue!.localeCompare(b.nextServiceDue!))

  const statusCounts = {
    active:           assets.filter(a => a.status === 'active').length,
    maintenance:      assets.filter(a => a.status === 'maintenance').length,
    'out-of-service': assets.filter(a => a.status === 'out-of-service').length,
    retired:          assets.filter(a => a.status === 'retired').length,
  }

  const types: AssetType[] = ['vehicle', 'equipment', 'trailer']

  return (
    <div className="min-h-screen bg-gray-50">
      <CompanyNav company={company} />
      <main className="max-w-6xl mx-auto px-6 py-8 space-y-6">

        {/* Type stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {types.map(type => {
            const stats = statsForType(type)
            const { label, icon } = TYPE_CONFIG[type]
            return (
              <Link
                key={type}
                href={`/${company}/${type}s`}
                className="bg-white rounded-xl border border-gray-200 p-5 hover:border-gray-300 hover:shadow-sm transition-all group"
              >
                <div className="flex items-start justify-between mb-3">
                  <span className="text-2xl">{icon}</span>
                  <span className="text-xs text-gray-400 group-hover:text-gray-500 transition-colors">View all →</span>
                </div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{label}</p>
                <p className="text-3xl font-bold text-gray-900 tabular-nums">{stats.total}</p>
                <div className="mt-3 space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-400">Active</span>
                    <span className="font-semibold text-green-600">{stats.active}</span>
                  </div>
                  {stats.needsAttention > 0 && (
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-400">Needs attention</span>
                      <span className="font-semibold text-orange-500">{stats.needsAttention}</span>
                    </div>
                  )}
                  {stats.dueSoon > 0 && (
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-400">Service due</span>
                      <span className="font-semibold text-yellow-600">{stats.dueSoon}</span>
                    </div>
                  )}
                </div>
              </Link>
            )
          })}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

          {/* Status breakdown */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">Fleet Status</h2>
            <div className="space-y-3">
              <StatusRow label="Active"         count={statusCounts.active}           total={assets.length} colorClass="bg-green-500" />
              <StatusRow label="In Maintenance" count={statusCounts.maintenance}       total={assets.length} colorClass="bg-yellow-400" />
              <StatusRow label="Out of Service" count={statusCounts['out-of-service']} total={assets.length} colorClass="bg-red-400" />
              <StatusRow label="Retired"        count={statusCounts.retired}           total={assets.length} colorClass="bg-gray-300" />
            </div>
            <div className="mt-4 pt-3 border-t border-gray-100">
              <p className="text-xs text-gray-400">{assets.length} total assets</p>
            </div>
          </div>

          {/* Upcoming service */}
          <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center gap-2 mb-4">
              <h2 className="text-sm font-semibold text-gray-700">Upcoming Service</h2>
              {upcomingService.length > 0 && (
                <span className="px-2 py-0.5 bg-yellow-100 text-yellow-700 text-xs rounded-full font-medium">
                  {upcomingService.length}
                </span>
              )}
            </div>
            {upcomingService.length === 0 ? (
              <p className="text-sm text-gray-400">No service due in the next 30 days.</p>
            ) : (
              <div className="space-y-1">
                {upcomingService.slice(0, 8).map(asset => {
                  const days = daysUntil(asset.nextServiceDue!)
                  const isOverdue = days < 0
                  const isDueSoon = days >= 0 && days <= 7
                  return (
                    <Link
                      key={asset.id}
                      href={`/${company}/${asset.id}`}
                      className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-gray-50 -mx-3 transition-colors"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{asset.name}</p>
                        <p className="text-xs text-gray-400 capitalize">
                          {asset.type}{asset.assignedTo ? ` · ${asset.assignedTo}` : ''}
                        </p>
                      </div>
                      <div className="text-right shrink-0 ml-4">
                        <p className="text-xs text-gray-500">{formatDate(asset.nextServiceDue!)}</p>
                        <p className={`text-xs font-semibold ${isOverdue ? 'text-red-600' : isDueSoon ? 'text-orange-500' : 'text-yellow-600'}`}>
                          {isOverdue
                            ? `${Math.abs(days)}d overdue`
                            : days === 0
                            ? 'Due today'
                            : `In ${days}d`}
                        </p>
                      </div>
                    </Link>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {assets.length === 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <p className="text-gray-400 text-lg mb-1">No assets yet</p>
            <p className="text-sm text-gray-400 mb-6">Start by adding vehicles, equipment, and trailers to your fleet.</p>
            <Link
              href={`/${company}/add`}
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg text-white text-sm font-medium"
              style={{ backgroundColor: companyColor }}
            >
              + Add your first asset
            </Link>
          </div>
        )}

        {/* Recent assets */}
        {assets.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-700">Recent Assets</h2>
              <Link href={`/${company}/add`} className="text-xs font-medium" style={{ color: companyColor }}>
                + Add asset
              </Link>
            </div>
            <table className="w-full">
              <thead>
                <tr className="text-left text-xs font-semibold text-white" style={{ backgroundColor: companyColor }}>
                  <th className="px-4 py-2.5">Name</th>
                  <th className="px-4 py-2.5 hidden sm:table-cell">Type</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5 hidden md:table-cell">Assigned To</th>
                  <th className="px-4 py-2.5 w-16"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {assets.slice(-10).reverse().map((asset, i) => (
                  <tr key={asset.id} className={`hover:bg-gray-50 transition-colors ${i % 2 === 1 ? 'bg-[#002D5B]/[0.02]' : ''}`}>
                    <td className="px-4 py-3">
                      <Link href={`/${company}/${asset.id}`} className="text-sm font-medium text-gray-900 hover:underline">
                        {asset.name}
                      </Link>
                      {asset.make && <p className="text-xs text-gray-400">{[asset.make, asset.model].filter(Boolean).join(' ')}</p>}
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell text-sm text-gray-500 capitalize">{asset.type}</td>
                    <td className="px-4 py-3"><StatusBadge status={asset.status} /></td>
                    <td className="px-4 py-3 hidden md:table-cell text-sm text-gray-500">{asset.assignedTo || '—'}</td>
                    <td className="px-4 py-3 text-right">
                      <Link href={`/${company}/${asset.id}`} className="text-xs text-gray-400 hover:text-gray-600">View →</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

      </main>
    </div>
  )
}

function StatusRow({ label, count, total, colorClass }: {
  label: string; count: number; total: number; colorClass: string
}) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-gray-500">{label}</span>
        <span className="font-medium text-gray-700">{count}</span>
      </div>
      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full ${colorClass} rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}
