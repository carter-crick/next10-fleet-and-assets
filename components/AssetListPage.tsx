'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import CompanyNav from './CompanyNav'
import StatusBadge from './StatusBadge'
import type { Asset, AssetStatus, AssetType, Company } from '@/lib/types'

const TYPE_LABEL: Record<AssetType, string> = {
  vehicle:   'Vehicles',
  equipment: 'Equipment',
  trailer:   'Trailers',
}

const STATUS_OPTIONS: { value: AssetStatus | 'all'; label: string }[] = [
  { value: 'all',            label: 'All Statuses'   },
  { value: 'active',         label: 'Active'         },
  { value: 'open',           label: 'Open'           },
  { value: 'maintenance',    label: 'In Maintenance' },
  { value: 'out-of-service', label: 'Out of Service' },
  { value: 'retired',        label: 'Retired'        },
]

function formatDate(dateStr?: string) {
  if (!dateStr) return '—'
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

function formatMonthYear(dateStr?: string) {
  if (!dateStr) return null
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

type PlateStatus = 'expired' | 'expiring' | 'ok'
function plateStatus(dateStr?: string): PlateStatus {
  if (!dateStr) return 'ok'
  const d = daysUntil(dateStr)
  if (d < 0) return 'expired'
  if (d <= 30) return 'expiring'
  return 'ok'
}

export default function AssetListPage({ company, type }: { company: Company; type: AssetType }) {
  const [assets, setAssets] = useState<Asset[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<AssetStatus | 'all'>('all')

  const companyColor = company === 'balanced-comfort' ? '#002D5B' : '#0f766e'
  const singularLabel = TYPE_LABEL[type].slice(0, -1)

  useEffect(() => {
    fetch(`/api/assets?company=${company}&type=${type}`)
      .then(r => r.json())
      .then(data => { setAssets(data); setLoading(false) })
  }, [company, type])

  const filtered = assets.filter(a => {
    const q = search.toLowerCase()
    const matchSearch = !q ||
      a.name.toLowerCase().includes(q) ||
      a.make?.toLowerCase().includes(q) ||
      a.model?.toLowerCase().includes(q) ||
      a.assignedTo?.toLowerCase().includes(q) ||
      a.licensePlate?.toLowerCase().includes(q) ||
      a.serialNumber?.toLowerCase().includes(q) ||
      a.location?.toLowerCase().includes(q)
    const matchStatus = statusFilter === 'all' || a.status === statusFilter
    return matchSearch && matchStatus
  })

  const identifierLabel = type === 'equipment' ? 'Serial #' : 'License Plate'

  return (
    <div className="min-h-screen bg-gray-50">
      <CompanyNav company={company} />
      <main className="max-w-6xl mx-auto px-6 py-8">

        <div className="flex items-center justify-between mb-5">
          <h1 className="text-xl font-semibold text-gray-900">{TYPE_LABEL[type]}</h1>
          <Link
            href={`/${company}/add?type=${type}`}
            className="px-4 py-2 rounded-lg text-white text-sm font-medium hover:opacity-90 transition-opacity"
            style={{ backgroundColor: companyColor }}
          >
            + Add {singularLabel}
          </Link>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4 flex gap-3 flex-wrap items-center">
          <input
            type="text"
            placeholder={`Search ${TYPE_LABEL[type].toLowerCase()}...`}
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="flex-1 min-w-44 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#002D5B]"
          />
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as AssetStatus | 'all')}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#002D5B]"
          >
            {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <span className="text-xs text-gray-400 shrink-0">{filtered.length} of {assets.length}</span>
        </div>

        {/* Plate expiration alerts — vehicles & trailers only */}
        {!loading && type !== 'equipment' && (() => {
          const expired  = filtered.filter(a => plateStatus(a.licensePlateExpiration) === 'expired')
          const expiring = filtered.filter(a => plateStatus(a.licensePlateExpiration) === 'expiring')
          if (!expired.length && !expiring.length) return null
          return (
            <div className="space-y-2 mb-4">
              {expired.length > 0 && (
                <div className="flex items-start gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
                  <span className="font-semibold shrink-0">⚠ {expired.length} plate{expired.length > 1 ? 's' : ''} expired:</span>
                  <span>{expired.map(a => `${a.name} (${formatMonthYear(a.licensePlateExpiration)})`).join(', ')}</span>
                </div>
              )}
              {expiring.length > 0 && (
                <div className="flex items-start gap-2 px-4 py-3 bg-orange-50 border border-orange-200 rounded-xl text-sm text-orange-700">
                  <span className="font-semibold shrink-0">⚠ {expiring.length} plate{expiring.length > 1 ? 's' : ''} expiring within 30 days:</span>
                  <span>{expiring.map(a => `${a.name} (${formatMonthYear(a.licensePlateExpiration)}, ${daysUntil(a.licensePlateExpiration!)}d)`).join(', ')}</span>
                </div>
              )}
            </div>
          )
        })()}

        {loading ? (
          <div className="flex items-center justify-center h-48">
            <p className="text-gray-400 text-sm">Loading...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <p className="text-gray-400 text-lg mb-1">
              {assets.length === 0 ? `No ${TYPE_LABEL[type].toLowerCase()} yet` : 'No results match your filters'}
            </p>
            {assets.length === 0 && (
              <Link
                href={`/${company}/add?type=${type}`}
                className="inline-flex items-center gap-2 mt-4 px-6 py-2.5 rounded-lg text-white text-sm font-medium"
                style={{ backgroundColor: companyColor }}
              >
                + Add first {singularLabel.toLowerCase()}
              </Link>
            )}
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px]">
                <thead>
                  <tr className="text-left text-xs font-semibold text-white" style={{ backgroundColor: companyColor }}>
                    <th className="px-4 py-3">Name</th>
                    <th className="px-4 py-3">Make / Model</th>
                    <th className="px-4 py-3">{identifierLabel}</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Assigned To</th>
                    <th className="px-4 py-3">Next Service</th>
                    <th className="px-4 py-3 w-16"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filtered.map((asset, i) => {
                    const dueDays = asset.nextServiceDue ? daysUntil(asset.nextServiceDue) : null
                    const isOverdue = dueDays !== null && dueDays < 0
                    const isDueSoon = dueDays !== null && dueDays >= 0 && dueDays <= 7
                    return (
                      <tr key={asset.id} className={`hover:bg-gray-50 transition-colors ${i % 2 === 1 ? 'bg-[#002D5B]/[0.02]' : ''}`}>
                        <td className="px-4 py-3">
                          <Link href={`/${company}/${asset.id}`} className="font-medium text-gray-900 hover:underline text-sm">
                            {asset.name}
                          </Link>
                          {asset.year && <p className="text-xs text-gray-400">{asset.year}</p>}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {[asset.make, asset.model].filter(Boolean).join(' ') || '—'}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {type === 'equipment' ? (asset.serialNumber || '—') : (
                            <>
                              <span>{asset.licensePlate || '—'}</span>
                              {asset.licensePlateExpiration && (() => {
                                const ps = plateStatus(asset.licensePlateExpiration)
                                const cls = ps === 'expired' ? 'text-red-600 font-medium' : ps === 'expiring' ? 'text-orange-500 font-medium' : 'text-gray-400'
                                return <span className={`block text-xs ${cls}`}>Exp {formatMonthYear(asset.licensePlateExpiration)}</span>
                              })()}
                            </>
                          )}
                        </td>
                        <td className="px-4 py-3"><StatusBadge status={asset.status} /></td>
                        <td className="px-4 py-3 text-sm text-gray-600">{asset.assignedTo || '—'}</td>
                        <td className="px-4 py-3 text-sm">
                          {asset.nextServiceDue ? (
                            <span className={isOverdue ? 'text-red-600 font-medium' : isDueSoon ? 'text-orange-500 font-medium' : 'text-gray-600'}>
                              {formatDate(asset.nextServiceDue)}
                              {isOverdue && <span className="block text-xs">overdue</span>}
                            </span>
                          ) : '—'}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Link href={`/${company}/${asset.id}`} className="text-xs text-gray-400 hover:text-gray-600">View →</Link>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
