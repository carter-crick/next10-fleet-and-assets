'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import CompanyNav from './CompanyNav'
import StatusBadge from './StatusBadge'
import type { Asset, AssetType, Company, InspectionRecord } from '@/lib/types'
import type { FuelSummary } from '@/app/api/wex/summary/route'

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
  const [inspections, setInspections] = useState<InspectionRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [fuel, setFuel] = useState<FuelSummary | null>(null)
  const [fuelExpanded, setFuelExpanded] = useState<'nonUnleaded' | 'mpg' | 'odo' | null>(null)

  const companyColor = company === 'balanced-comfort' ? '#002D5B' : '#0f766e'

  useEffect(() => {
    fetch(`/api/assets?company=${company}`)
      .then(r => r.json())
      .then(data => { setAssets(data); setLoading(false) })
    fetch(`/api/inspections?company=${company}`)
      .then(r => r.ok ? r.json() : [])
      .then(data => Array.isArray(data) && setInspections(data))
    fetch(`/api/wex/summary?company=${company}&days=30`)
      .then(r => r.ok ? r.json() : null)
      .then(data => data && setFuel(data))
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

  // Latest inspection per vehicle → next due at +90 days
  const lastInspByAsset = new Map<string, string>()
  for (const insp of inspections) {
    const existing = lastInspByAsset.get(insp.assetId)
    if (!existing || insp.date > existing) lastInspByAsset.set(insp.assetId, insp.date)
  }
  const vehicles = assets.filter(a => a.type === 'vehicle')
  const upcomingInspections = vehicles
    .map(v => {
      const lastDate = lastInspByAsset.get(v.id)
      if (!lastDate) return { asset: v, nextDue: null as Date | null, daysUntilDue: -Infinity }
      const next = new Date(lastDate + 'T00:00:00')
      next.setDate(next.getDate() + 90)
      const days = Math.ceil((next.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
      return { asset: v, nextDue: next, daysUntilDue: days }
    })
    .filter(r => r.daysUntilDue <= 30)
    .sort((a, b) => a.daysUntilDue - b.daysUntilDue)

  const types: AssetType[] = ['vehicle', 'equipment', 'trailer']

  return (
    <div className="min-h-screen bg-gray-50">
      <CompanyNav company={company} />
      <main className="max-w-6xl mx-auto px-6 py-8 space-y-6">

        {/* Type stats + Fleet Status — single row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
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

          {/* Fleet Status */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Fleet Status</p>
            <p className="text-3xl font-bold text-gray-900 tabular-nums mb-3">{assets.length}</p>
            <div className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-gray-400">Active</span>
                <span className="font-semibold text-green-600">{statusCounts.active}</span>
              </div>
              {statusCounts.maintenance > 0 && (
                <div className="flex justify-between text-xs">
                  <span className="text-gray-400">Maintenance</span>
                  <span className="font-semibold text-yellow-600">{statusCounts.maintenance}</span>
                </div>
              )}
              {statusCounts['out-of-service'] > 0 && (
                <div className="flex justify-between text-xs">
                  <span className="text-gray-400">Out of service</span>
                  <span className="font-semibold text-red-500">{statusCounts['out-of-service']}</span>
                </div>
              )}
              {statusCounts.retired > 0 && (
                <div className="flex justify-between text-xs">
                  <span className="text-gray-400">Retired</span>
                  <span className="font-semibold text-gray-400">{statusCounts.retired}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Upcoming Service + Upcoming Inspections */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

          {/* Upcoming service */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
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
                          {isOverdue ? `${Math.abs(days)}d overdue` : days === 0 ? 'Due today' : `In ${days}d`}
                        </p>
                      </div>
                    </Link>
                  )
                })}
              </div>
            )}
          </div>

          {/* Upcoming inspections */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center gap-2 mb-4">
              <h2 className="text-sm font-semibold text-gray-700">Upcoming Inspections</h2>
              {upcomingInspections.length > 0 && (
                <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full font-medium">
                  {upcomingInspections.length}
                </span>
              )}
            </div>
            {upcomingInspections.length === 0 ? (
              <p className="text-sm text-gray-400">No vehicle inspections due in the next 30 days.</p>
            ) : (
              <div className="space-y-1">
                {upcomingInspections.slice(0, 8).map(({ asset, nextDue, daysUntilDue }) => {
                  const isOverdue = daysUntilDue < 0
                  const isDueSoon = daysUntilDue >= 0 && daysUntilDue <= 7
                  const neverInspected = nextDue === null
                  return (
                    <Link
                      key={asset.id}
                      href={`/${company}/${asset.id}`}
                      className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-gray-50 -mx-3 transition-colors"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{asset.name}</p>
                        <p className="text-xs text-gray-400">{asset.assignedTo || 'Unassigned'}</p>
                      </div>
                      <div className="text-right shrink-0 ml-4">
                        {neverInspected ? (
                          <p className="text-xs font-semibold text-red-600">No inspection on file</p>
                        ) : (
                          <>
                            <p className="text-xs text-gray-500">
                              {nextDue!.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                            </p>
                            <p className={`text-xs font-semibold ${isOverdue ? 'text-red-600' : isDueSoon ? 'text-orange-500' : 'text-blue-600'}`}>
                              {isOverdue ? `${Math.abs(daysUntilDue)}d overdue` : daysUntilDue === 0 ? 'Due today' : `In ${daysUntilDue}d`}
                            </p>
                          </>
                        )}
                      </div>
                    </Link>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── Fuel Summary Tile ───────────────────────────────────────────────── */}
        {fuel && fuel.totals.transactions > 0 && (() => {
          const { totals, alerts } = fuel
          const alertCount = alerts.nonUnleaded.length + alerts.mpgAnomalies.length + alerts.odometerDiscrepancies.length
          return (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              {/* Header */}
              <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-3">
                  <h2 className="text-sm font-semibold text-gray-700">Fuel — Last 30 Days</h2>
                  <Link href={`/${company}/fuel`} className="text-xs text-gray-400 hover:text-gray-600">Import CSV →</Link>
                </div>
                {alertCount > 0 && (
                  <div className="flex items-center gap-2">
                    {alerts.nonUnleaded.length > 0 && (
                      <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs font-semibold rounded-full">
                        {alerts.nonUnleaded.length} non-unleaded
                      </span>
                    )}
                    {alerts.mpgAnomalies.length > 0 && (
                      <span className="px-2 py-0.5 bg-orange-100 text-orange-700 text-xs font-semibold rounded-full">
                        {alerts.mpgAnomalies.length} MPG {alerts.mpgAnomalies.length === 1 ? 'alert' : 'alerts'}
                      </span>
                    )}
                    {alerts.odometerDiscrepancies.length > 0 && (
                      <span className="px-2 py-0.5 bg-yellow-100 text-yellow-700 text-xs font-semibold rounded-full">
                        {alerts.odometerDiscrepancies.length} odo {alerts.odometerDiscrepancies.length === 1 ? 'mismatch' : 'mismatches'}
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Stats */}
              <div className="px-5 py-4 grid grid-cols-2 sm:grid-cols-4 gap-4 border-b border-gray-100">
                <FuelStat label="Spend" value={`$${totals.spend.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} />
                <FuelStat label="Gallons" value={totals.gallons.toLocaleString('en-US', { maximumFractionDigits: 0 })} />
                <FuelStat label="Avg $/Gal" value={`$${totals.avgCostPerGallon.toFixed(3)}`} />
                <FuelStat label="Vehicles" value={`${totals.vehicles} of ${assets.filter(a => a.type === 'vehicle' && a.fuelCardNumber).length}`} />
              </div>

              {/* Alert sections */}
              {alertCount === 0 && (
                <div className="px-5 py-3">
                  <p className="text-xs text-gray-400">No fuel alerts in the last 30 days.</p>
                </div>
              )}

              {/* Non-unleaded */}
              {alerts.nonUnleaded.length > 0 && (
                <AlertSection
                  label="Non-unleaded fuel"
                  count={alerts.nonUnleaded.length}
                  colorClass="bg-red-50 border-red-100"
                  labelColor="text-red-700"
                  icon="⛽"
                  expanded={fuelExpanded === 'nonUnleaded'}
                  onToggle={() => setFuelExpanded(e => e === 'nonUnleaded' ? null : 'nonUnleaded')}
                >
                  {alerts.nonUnleaded.slice(0, fuelExpanded === 'nonUnleaded' ? 999 : 3).map((a, i) => (
                    <AlertRow key={i} href={`/${company}/${a.assetId}`} company={company}>
                      <span className="font-medium text-gray-900 truncate">{a.vehicleName}</span>
                      <span className="text-red-700 font-medium">{a.productType}</span>
                      <span className="text-gray-500 truncate">{a.merchantName}</span>
                      <span className="text-gray-400 shrink-0">{fmtDate(a.date)}</span>
                      <span className="text-gray-700 font-medium shrink-0">${a.totalAmount.toFixed(2)}</span>
                    </AlertRow>
                  ))}
                </AlertSection>
              )}

              {/* MPG anomalies */}
              {alerts.mpgAnomalies.length > 0 && (
                <AlertSection
                  label="MPG outside normal range (±15%)"
                  count={alerts.mpgAnomalies.length}
                  colorClass="bg-orange-50 border-orange-100"
                  labelColor="text-orange-700"
                  icon="📊"
                  expanded={fuelExpanded === 'mpg'}
                  onToggle={() => setFuelExpanded(e => e === 'mpg' ? null : 'mpg')}
                >
                  {alerts.mpgAnomalies.slice(0, fuelExpanded === 'mpg' ? 999 : 3).map((a, i) => (
                    <AlertRow key={i} href={`/${company}/${a.assetId}`} company={company}>
                      <span className="font-medium text-gray-900 truncate">{a.vehicleName}</span>
                      <span className={`font-semibold ${a.direction === 'low' ? 'text-orange-700' : 'text-blue-600'}`}>
                        {a.actualMpg} mpg
                      </span>
                      <span className="text-gray-400">avg {a.avgMpg} mpg</span>
                      <span className={`font-medium shrink-0 ${a.pctDiff < 0 ? 'text-orange-600' : 'text-blue-600'}`}>
                        {a.pctDiff > 0 ? '+' : ''}{a.pctDiff}%
                      </span>
                      <span className="text-gray-400 shrink-0">{fmtDate(a.date)}</span>
                    </AlertRow>
                  ))}
                </AlertSection>
              )}

              {/* Odometer discrepancies */}
              {alerts.odometerDiscrepancies.length > 0 && (
                <AlertSection
                  label="Odometer mismatch vs GPS"
                  count={alerts.odometerDiscrepancies.length}
                  colorClass="bg-yellow-50 border-yellow-100"
                  labelColor="text-yellow-700"
                  icon="🛣️"
                  expanded={fuelExpanded === 'odo'}
                  onToggle={() => setFuelExpanded(e => e === 'odo' ? null : 'odo')}
                >
                  {alerts.odometerDiscrepancies.slice(0, fuelExpanded === 'odo' ? 999 : 3).map((a, i) => (
                    <AlertRow key={i} href={`/${company}/${a.assetId}`} company={company}>
                      <span className="font-medium text-gray-900 truncate">{a.vehicleName}</span>
                      <span className="text-gray-700">WEX <span className="font-medium">{a.wexOdometer.toLocaleString()}</span></span>
                      <span className="text-gray-500">GPS <span className="font-medium">{a.gpsOdometer.toLocaleString()}</span></span>
                      <span className="text-yellow-700 font-semibold shrink-0">Δ {a.difference.toLocaleString()} mi</span>
                      <span className="text-gray-400 shrink-0">{fmtDate(a.date)}</span>
                    </AlertRow>
                  ))}
                </AlertSection>
              )}
            </div>
          )
        })()}

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

function FuelStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-gray-400 mb-0.5">{label}</p>
      <p className="text-xl font-bold text-gray-900 tabular-nums">{value}</p>
    </div>
  )
}

function AlertSection({
  label, count, colorClass, labelColor, icon, expanded, onToggle, children,
}: {
  label: string; count: number; colorClass: string; labelColor: string
  icon: string; expanded: boolean; onToggle: () => void; children: React.ReactNode
}) {
  return (
    <div className={`border-t ${colorClass}`}>
      <button
        onClick={onToggle}
        className="w-full px-5 py-2.5 flex items-center gap-2 text-left hover:opacity-80 transition-opacity"
      >
        <span className="text-sm">{icon}</span>
        <span className={`text-xs font-semibold ${labelColor}`}>{label}</span>
        <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${labelColor} bg-white/60`}>{count}</span>
        <span className="ml-auto text-xs text-gray-400">{expanded ? '▲ less' : '▼ more'}</span>
      </button>
      <div className="px-5 pb-3 space-y-1.5">{children}</div>
    </div>
  )
}

function AlertRow({ href, company, children }: { href: string; company: string; children: React.ReactNode }) {
  void company
  return (
    <Link href={href} className="flex items-center gap-3 py-1.5 px-3 -mx-3 rounded-lg hover:bg-white/70 transition-colors flex-wrap">
      {children}
    </Link>
  )
}

function fmtDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
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
