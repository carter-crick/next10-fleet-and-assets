'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import CompanyNav from './CompanyNav'
import StatusBadge from './StatusBadge'
import type { Asset, AssetStatus, Company, Driver, DriveStop, GpsLocation, InspectionRecord, MaintenanceRecord, WexTransaction } from '@/lib/types'

const STATUS_OPTIONS: { value: AssetStatus; label: string }[] = [
  { value: 'active',         label: 'Active'          },
  { value: 'open',           label: 'Open'            },
  { value: 'maintenance',    label: 'In Maintenance'  },
  { value: 'out-of-service', label: 'Out of Service'  },
  { value: 'retired',        label: 'Retired'         },
]

const MAINTENANCE_TYPES = [
  'Oil Change', 'Tire Rotation', 'Tire Replacement', 'Inspection',
  'Registration', 'Insurance', 'Repair', 'Cleaning', 'Other',
]

function formatDate(dateStr?: string) {
  if (!dateStr) return '—'
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

function formatCurrency(n?: number) {
  if (n == null) return '—'
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
}

function InfoRow({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div>
      <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-0.5">{label}</p>
      <p className="text-sm text-gray-800">{value ?? '—'}</p>
    </div>
  )
}

const inputCls = 'block w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#002D5B]'

export default function AssetDetailPage({ company, id }: { company: Company; id: string }) {
  const router = useRouter()
  const companyColor = company === 'balanced-comfort' ? '#002D5B' : '#0f766e'

  const [asset, setAsset] = useState<Asset | null>(null)
  const [maintenance, setMaintenance] = useState<MaintenanceRecord[]>([])
  const [inspections, setInspections] = useState<InspectionRecord[]>([])
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState<Partial<Asset>>({})
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // Maintenance form
  const [showMaintForm, setShowMaintForm] = useState(false)
  const [maintForm, setMaintForm] = useState({
    date: '', type: 'Oil Change', description: '', mileage: '', cost: '', vendor: '', notes: '',
  })
  const [savingMaint, setSavingMaint] = useState(false)

  // Inspection form
  const [showInspForm, setShowInspForm] = useState(false)
  const [inspForm, setInspForm] = useState({ date: '', driver: '', mileage: '', notes: '' })
  const [inspFiles, setInspFiles] = useState<File[]>([])
  const [savingInsp, setSavingInsp] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // GPS
  const [gpsLocation, setGpsLocation] = useState<GpsLocation | null>(null)

  // WEX fuel transactions
  const [wexTransactions, setWexTransactions] = useState<WexTransaction[]>([])

  // Drive/stop history
  const [driveStops, setDriveStops] = useState<DriveStop[]>([])
  const [showAllFuel, setShowAllFuel] = useState(false)

  useEffect(() => {
    Promise.all([
      fetch(`/api/assets/${id}?company=${company}`).then(r => r.json()),
      fetch(`/api/assets/${id}/maintenance?company=${company}`).then(r => r.json()),
      fetch(`/api/assets/${id}/inspections?company=${company}`).then(r => r.json()),
      fetch(`/api/drivers?company=${company}`).then(r => r.json()),
    ]).then(([a, m, insp, d]) => {
      setAsset(a)
      setEditForm(a)
      setMaintenance(m)
      setInspections(Array.isArray(insp) ? insp : [])
      setDrivers(Array.isArray(d) ? d : [])
      setInspForm(f => ({ ...f, driver: a?.assignedTo || '' }))
      setLoading(false)
      if (a?.oneStepDeviceId) {
        fetch(`/api/gps/device/${a.oneStepDeviceId}`)
          .then(r => r.ok ? r.json() : null)
          .then(loc => loc && setGpsLocation(loc))
        fetch(`/api/gps/trips/${a.oneStepDeviceId}`)
          .then(r => r.ok ? r.json() : [])
          .then(t => setDriveStops(Array.isArray(t) ? t : []))
      }
      if (a?.fuelCardNumber) {
        fetch(`/api/wex/transactions/${a.fuelCardNumber}`)
          .then(r => r.ok ? r.json() : [])
          .then(txns => setWexTransactions(Array.isArray(txns) ? txns : []))
      }
    })
  }, [company, id])

  function setEdit(field: keyof Asset, value: string | number | undefined) {
    setEditForm(f => ({ ...f, [field]: value }))
  }

  async function handleSave() {
    if (!asset) return
    setSaving(true)
    try {
      const res = await fetch(`/api/assets/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...editForm, company }),
      })
      if (!res.ok) throw new Error('Failed')
      const updated = await res.json()
      setAsset(updated)
      setEditing(false)
    } catch {
      alert('Failed to save. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!confirm(`Delete "${asset?.name}"? This cannot be undone.`)) return
    setDeleting(true)
    try {
      await fetch(`/api/assets/${id}?company=${company}`, { method: 'DELETE' })
      router.push(`/${company}`)
    } catch {
      alert('Failed to delete. Please try again.')
      setDeleting(false)
    }
  }

  async function handleAddMaintenance(e: React.FormEvent) {
    e.preventDefault()
    if (!maintForm.date || !maintForm.description.trim()) return
    setSavingMaint(true)
    try {
      const res = await fetch(`/api/assets/${id}/maintenance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company,
          date: maintForm.date,
          type: maintForm.type,
          description: maintForm.description.trim(),
          ...(maintForm.mileage && { mileage: parseInt(maintForm.mileage) }),
          ...(maintForm.cost    && { cost: parseFloat(maintForm.cost) }),
          ...(maintForm.vendor  && { vendor: maintForm.vendor }),
          ...(maintForm.notes   && { notes: maintForm.notes }),
        }),
      })
      if (!res.ok) throw new Error('Failed')
      const record = await res.json()
      setMaintenance(m => [record, ...m])
      setMaintForm({ date: '', type: 'Oil Change', description: '', mileage: '', cost: '', vendor: '', notes: '' })
      setShowMaintForm(false)
    } catch {
      alert('Failed to save record. Please try again.')
    } finally {
      setSavingMaint(false)
    }
  }

  async function handleDeleteMaintenance(recordId: string) {
    if (!confirm('Delete this maintenance record?')) return
    await fetch(`/api/assets/${id}/maintenance?company=${company}&recordId=${recordId}`, { method: 'DELETE' })
    setMaintenance(m => m.filter(r => r.id !== recordId))
  }

  async function handleAddInspection(e: React.FormEvent) {
    e.preventDefault()
    if (!inspForm.date || !inspForm.driver.trim()) return
    setSavingInsp(true)
    try {
      // Upload photos first
      let photoUrls: string[] = []
      if (inspFiles.length > 0) {
        const fd = new FormData()
        inspFiles.forEach(f => fd.append('files', f))
        const upRes = await fetch(`/api/upload?assetId=${id}`, { method: 'POST', body: fd })
        if (upRes.ok) {
          const upData = await upRes.json()
          photoUrls = upData.urls ?? []
        }
      }

      const res = await fetch(`/api/assets/${id}/inspections`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company,
          date: inspForm.date,
          driver: inspForm.driver.trim(),
          ...(inspForm.mileage && { mileage: parseInt(inspForm.mileage) }),
          ...(inspForm.notes   && { notes: inspForm.notes.trim() }),
          photos: photoUrls,
        }),
      })
      if (!res.ok) throw new Error('Failed')
      const record = await res.json()
      setInspections(i => [record, ...i])
      setInspForm({ date: '', driver: asset?.assignedTo || '', mileage: '', notes: '' })
      setInspFiles([])
      if (fileInputRef.current) fileInputRef.current.value = ''
      setShowInspForm(false)
    } catch {
      alert('Failed to save inspection. Please try again.')
    } finally {
      setSavingInsp(false)
    }
  }

  async function handleDeleteInspection(recordId: string) {
    if (!confirm('Delete this inspection record?')) return
    await fetch(`/api/assets/${id}/inspections?company=${company}&recordId=${recordId}`, { method: 'DELETE' })
    setInspections(i => i.filter(r => r.id !== recordId))
  }

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

  if (!asset || (asset as { error?: string }).error) {
    return (
      <div className="min-h-screen bg-gray-50">
        <CompanyNav company={company} />
        <div className="max-w-6xl mx-auto px-6 py-8">
          <p className="text-gray-500">Asset not found.</p>
        </div>
      </div>
    )
  }

  const isVehicleOrTrailer = asset.type === 'vehicle' || asset.type === 'trailer'
  const isVehicle = asset.type === 'vehicle'

  return (
    <div className="min-h-screen bg-gray-50">
      <CompanyNav company={company} />
      <main className="max-w-4xl mx-auto px-6 py-8 space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <button onClick={() => router.back()} className="text-sm text-gray-400 hover:text-gray-600 mb-2 block">
              ← Back
            </button>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold text-gray-900">{asset.name}</h1>
              <StatusBadge status={asset.status} />
              <span className="text-xs font-medium text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full capitalize">
                {asset.type}
              </span>
            </div>
            {asset.make && (
              <p className="text-sm text-gray-500 mt-1">
                {[asset.year, asset.make, asset.model].filter(Boolean).join(' ')}
              </p>
            )}
          </div>
          <div className="flex gap-2">
            {editing ? (
              <>
                <button onClick={() => { setEditing(false); setEditForm(asset) }} className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">
                  Cancel
                </button>
                <button onClick={handleSave} disabled={saving} className="px-4 py-2 rounded-lg text-white text-sm font-semibold disabled:opacity-40 hover:opacity-90 transition-opacity" style={{ backgroundColor: companyColor }}>
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              </>
            ) : (
              <>
                <button onClick={() => setEditing(true)} className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
                  Edit
                </button>
                <button onClick={handleDelete} disabled={deleting} className="px-4 py-2 border border-red-200 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 transition-colors disabled:opacity-40">
                  {deleting ? 'Deleting...' : 'Delete'}
                </button>
              </>
            )}
          </div>
        </div>

        {/* ── EDIT FORM ── */}
        {editing ? (
          <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
            <h2 className="text-sm font-semibold text-gray-700">Edit Asset</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                <input type="text" value={editForm.name || ''} onChange={e => setEdit('name', e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                <select value={editForm.status} onChange={e => setEdit('status', e.target.value)} className={inputCls}>
                  {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Make / Brand</label>
                <input type="text" value={editForm.make || ''} onChange={e => setEdit('make', e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Model</label>
                <input type="text" value={editForm.model || ''} onChange={e => setEdit('model', e.target.value)} className={inputCls} />
              </div>
              {isVehicleOrTrailer && <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Year</label>
                  <input type="number" value={editForm.year || ''} onChange={e => setEdit('year', e.target.value ? parseInt(e.target.value) : undefined)} min="1990" max="2035" className={inputCls} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Color</label>
                  <input type="text" value={editForm.color || ''} onChange={e => setEdit('color', e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">License Plate</label>
                  <input type="text" value={editForm.licensePlate || ''} onChange={e => setEdit('licensePlate', e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Plate Expiration</label>
                  <input type="date" value={editForm.licensePlateExpiration || ''} onChange={e => setEdit('licensePlateExpiration', e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">VIN</label>
                  <input type="text" value={editForm.vin || ''} onChange={e => setEdit('vin', e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Lender</label>
                  <input type="text" value={editForm.lender || ''} onChange={e => setEdit('lender', e.target.value)} placeholder="e.g. Enterprise Fleet, Company Owned" className={inputCls} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Fuel Card #</label>
                  <input type="text" value={editForm.fuelCardNumber || ''} onChange={e => setEdit('fuelCardNumber', e.target.value)} placeholder="e.g. 40972" className={inputCls} />
                </div>
              </>}
              {!isVehicleOrTrailer && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Serial Number</label>
                  <input type="text" value={editForm.serialNumber || ''} onChange={e => setEdit('serialNumber', e.target.value)} className={inputCls} />
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Assigned To</label>
                {isVehicle ? (
                  <select value={editForm.assignedTo || ''} onChange={e => setEdit('assignedTo', e.target.value)} className={inputCls}>
                    <option value="">— Unassigned —</option>
                    {drivers.map(d => (
                      <option key={d.id} value={d.name}>{d.name}</option>
                    ))}
                    {drivers.length === 0 && (
                      <option disabled>No drivers — add them in the Drivers tab</option>
                    )}
                  </select>
                ) : (
                  <input type="text" value={editForm.assignedTo || ''} onChange={e => setEdit('assignedTo', e.target.value)} className={inputCls} />
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
                <input type="text" value={editForm.location || ''} onChange={e => setEdit('location', e.target.value)} className={inputCls} />
              </div>
              {isVehicle && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Current Mileage</label>
                  <input type="number" value={editForm.mileage || ''} onChange={e => setEdit('mileage', e.target.value ? parseInt(e.target.value) : undefined)} min="0" className={inputCls} />
                </div>
              )}
              {isVehicle && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">OneStep GPS Device ID</label>
                  <input type="text" value={editForm.oneStepDeviceId || ''} onChange={e => setEdit('oneStepDeviceId', e.target.value)} placeholder="From OneStep GPS settings" className={inputCls} />
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Last Service Date</label>
                <input type="date" value={editForm.lastServiceDate || ''} onChange={e => setEdit('lastServiceDate', e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Next Service Due</label>
                <input type="date" value={editForm.nextServiceDue || ''} onChange={e => setEdit('nextServiceDue', e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Purchase Date</label>
                <input type="date" value={editForm.purchaseDate || ''} onChange={e => setEdit('purchaseDate', e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Purchase Price</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                  <input type="number" value={editForm.purchasePrice || ''} onChange={e => setEdit('purchasePrice', e.target.value ? parseFloat(e.target.value) : undefined)} min="0" step="0.01" className="block w-full border border-gray-300 rounded-lg pl-7 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#002D5B]" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">In Service Date</label>
                <input type="date" value={editForm.inServiceDate || ''} onChange={e => setEdit('inServiceDate', e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Out of Service Date <span className="text-xs font-normal text-gray-400">(totaled / sold)</span></label>
                <input type="date" value={editForm.outOfServiceDate || ''} onChange={e => setEdit('outOfServiceDate', e.target.value)} className={inputCls} />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <textarea value={editForm.notes || ''} onChange={e => setEdit('notes', e.target.value)} rows={3} className="block w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#002D5B] resize-none" />
              </div>
            </div>
          </div>

        ) : (
          // ── VIEW MODE ──
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

            {/* Details card */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
              <h2 className="text-sm font-semibold text-gray-700">Details</h2>
              <div className="grid grid-cols-2 gap-4">
                {isVehicleOrTrailer && <>
                  <InfoRow label="Year"          value={asset.year} />
                  <InfoRow label="Color"         value={asset.color} />
                  <InfoRow label="License Plate" value={asset.licensePlate} />
                  <div>
                    <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-0.5">Plate Expiration</p>
                    {asset.licensePlateExpiration ? (() => {
                      const days = Math.ceil((new Date(asset.licensePlateExpiration + 'T00:00:00').getTime() - new Date().setHours(0,0,0,0)) / 86400000)
                      const expired  = days < 0
                      const expiring = days >= 0 && days <= 30
                      const display  = new Date(asset.licensePlateExpiration + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
                      return (
                        <p className={`text-sm font-medium ${expired ? 'text-red-600' : expiring ? 'text-orange-500' : 'text-gray-800'}`}>
                          {display}
                          {expired  && <span className="ml-1 text-xs">({Math.abs(days)}d overdue)</span>}
                          {expiring && <span className="ml-1 text-xs">({days}d left)</span>}
                        </p>
                      )
                    })() : <p className="text-sm text-gray-800">—</p>}
                  </div>
                  <InfoRow label="VIN"           value={asset.vin} />
                  <InfoRow label="Lender"        value={asset.lender} />
                  {asset.fuelCardNumber && <InfoRow label="Fuel Card #" value={asset.fuelCardNumber} />}
                </>}
                {!isVehicleOrTrailer && (
                  <InfoRow label="Serial Number" value={asset.serialNumber} />
                )}
                <InfoRow label="Make"  value={asset.make} />
                <InfoRow label="Model" value={asset.model} />
              </div>
            </div>

            {/* Assignment card */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
              <h2 className="text-sm font-semibold text-gray-700">Assignment</h2>
              <div className="grid grid-cols-2 gap-4">
                <InfoRow label="Assigned To" value={asset.assignedTo} />
                <InfoRow label="Location"    value={asset.location} />
                {isVehicle && <InfoRow label="Mileage" value={asset.mileage?.toLocaleString()} />}
              </div>
            </div>

            {/* GPS Location card (vehicles with OneStep device ID) */}
            {isVehicle && asset.oneStepDeviceId && (
              <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-gray-700">Live Location</h2>
                  {gpsLocation ? (() => {
                    const mins = Math.floor((Date.now() - new Date(gpsLocation.receivedAt).getTime()) / 60000)
                    const fresh = mins < 15
                    const stale = mins >= 60
                    return (
                      <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full ${fresh ? 'bg-green-100 text-green-700' : stale ? 'bg-gray-100 text-gray-500' : 'bg-yellow-100 text-yellow-700'}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${fresh ? 'bg-green-500' : stale ? 'bg-gray-400' : 'bg-yellow-500'}`} />
                        {mins < 1 ? 'Just now' : mins < 60 ? `${mins}m ago` : `${Math.floor(mins / 60)}h ago`}
                      </span>
                    )
                  })() : (
                    <span className="text-xs text-gray-400">Waiting for first ping</span>
                  )}
                </div>
                {gpsLocation ? (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="sm:col-span-2">
                      <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-0.5">Address</p>
                      {gpsLocation.address ? (
                        <a
                          href={`https://www.google.com/maps?q=${gpsLocation.lat},${gpsLocation.lng}`}
                          target="_blank" rel="noopener noreferrer"
                          className="text-sm text-blue-600 hover:underline"
                        >
                          {gpsLocation.address}
                        </a>
                      ) : (
                        <a
                          href={`https://www.google.com/maps?q=${gpsLocation.lat},${gpsLocation.lng}`}
                          target="_blank" rel="noopener noreferrer"
                          className="text-sm text-blue-600 hover:underline font-mono"
                        >
                          {gpsLocation.lat.toFixed(5)}, {gpsLocation.lng.toFixed(5)}
                        </a>
                      )}
                    </div>
                    {gpsLocation.speed != null && (
                      <InfoRow label="Speed" value={`${Math.round(gpsLocation.speed)} mph`} />
                    )}
                    {gpsLocation.odometer != null && (
                      <InfoRow label="Odometer" value={`${gpsLocation.odometer.toLocaleString()} mi`} />
                    )}
                    {gpsLocation.engineHours != null && (
                      <InfoRow label="Engine Hours" value={`${gpsLocation.engineHours.toFixed(1)} hrs`} />
                    )}
                    <div>
                      <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-0.5">GPS Timestamp</p>
                      <p className="text-sm text-gray-800">{new Date(gpsLocation.timestamp).toLocaleString()}</p>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-gray-400">No location data received yet. Make sure the webhook URL is configured in OneStep GPS.</p>
                )}
              </div>
            )}

            {/* Service card */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
              <h2 className="text-sm font-semibold text-gray-700">Service</h2>
              <div className="grid grid-cols-2 gap-4">
                <InfoRow label="Last Service" value={formatDate(asset.lastServiceDate)} />
                <InfoRow label="Next Due"     value={formatDate(asset.nextServiceDue)} />
              </div>
            </div>

            {/* Purchase card */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
              <h2 className="text-sm font-semibold text-gray-700">Purchase & Service History</h2>
              <div className="grid grid-cols-2 gap-4">
                <InfoRow label="Purchase Date"  value={formatDate(asset.purchaseDate)} />
                <InfoRow label="Purchase Price" value={formatCurrency(asset.purchasePrice)} />
                <InfoRow label="In Service Date"      value={formatDate(asset.inServiceDate)} />
                <div>
                  <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-0.5">Out of Service Date</p>
                  <p className={`text-sm ${asset.outOfServiceDate ? 'text-red-600 font-medium' : 'text-gray-800'}`}>
                    {asset.outOfServiceDate ? formatDate(asset.outOfServiceDate) : '—'}
                  </p>
                  {asset.outOfServiceDate && (
                    <p className="text-xs text-gray-400 mt-0.5">Totaled or sold</p>
                  )}
                </div>
              </div>
            </div>

            {asset.notes && (
              <div className="md:col-span-2 bg-white rounded-xl border border-gray-200 p-5">
                <h2 className="text-sm font-semibold text-gray-700 mb-2">Notes</h2>
                <p className="text-sm text-gray-600 whitespace-pre-wrap">{asset.notes}</p>
              </div>
            )}
          </div>
        )}

        {/* ── TRIP HISTORY (vehicles with OneStep device ID) ── */}
        {isVehicle && asset.oneStepDeviceId && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-gray-700">Trip History</h2>
                <span className="text-xs text-gray-400">
                  ({driveStops.filter(d => d.type === 'drive').length} drives)
                </span>
              </div>
            </div>
            {driveStops.length === 0 ? (
              <div className="px-5 py-8 text-center">
                <p className="text-sm text-gray-400">No trips recorded yet.</p>
                <p className="text-xs text-gray-300 mt-1">Trips appear here once OneStep DataQueue is connected.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[620px]">
                  <thead>
                    <tr className="text-left text-xs font-semibold text-gray-500 border-b border-gray-100">
                      <th className="px-4 py-2.5">Date</th>
                      <th className="px-4 py-2.5">Type</th>
                      <th className="px-4 py-2.5">Duration</th>
                      <th className="px-4 py-2.5 text-right">Distance</th>
                      <th className="px-4 py-2.5">From → To</th>
                      <th className="px-4 py-2.5 text-right">Top Speed</th>
                      <th className="px-4 py-2.5">Events</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {driveStops.slice(0, 30).map((trip, i) => (
                      <tr key={trip.id} className={`text-sm hover:bg-gray-50 transition-colors ${i % 2 === 1 ? 'bg-[#002D5B]/[0.02]' : ''}`}>
                        <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                          {new Date(trip.timeFrom).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          <span className="block text-xs text-gray-400">
                            {new Date(trip.timeFrom).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                            trip.type === 'drive' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'
                          }`}>
                            {trip.type === 'drive' ? 'Drive' : 'Stop'}
                          </span>
                          {trip.isIncomplete && (
                            <span className="ml-1 text-xs text-gray-400">•</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-600">{formatDuration(trip.durationSec)}</td>
                        <td className="px-4 py-3 text-right text-gray-600 tabular-nums">
                          {trip.distanceMi != null ? `${trip.distanceMi.toFixed(1)} mi` : '—'}
                        </td>
                        <td className="px-4 py-3 text-gray-500 text-xs">
                          {(trip.zoneFrom || trip.zoneTo)
                            ? <>{trip.zoneFrom ?? '?'} → {trip.zoneTo ?? '?'}</>
                            : '—'}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {trip.topSpeedMph != null ? (
                            <span className={trip.topSpeedMph > 80 ? 'text-red-500 font-medium' : 'text-gray-600'}>
                              {Math.round(trip.topSpeedMph)} mph
                            </span>
                          ) : <span className="text-gray-400">—</span>}
                        </td>
                        <td className="px-4 py-3">
                          {trip.events && Object.keys(trip.events).length > 0 ? (
                            <div className="flex gap-1 flex-wrap">
                              {trip.events.hbrake != null && (
                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs bg-red-100 text-red-600" title="Hard brakes">
                                  ⚡{trip.events.hbrake}
                                </span>
                              )}
                              {trip.events.haccel != null && (
                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs bg-orange-100 text-orange-600" title="Hard acceleration">
                                  ↑{trip.events.haccel}
                                </span>
                              )}
                            </div>
                          ) : <span className="text-gray-300">—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── MAINTENANCE LOG ── */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-gray-700">Maintenance Log</h2>
              <span className="text-xs text-gray-400">({maintenance.length})</span>
            </div>
            <button
              onClick={() => setShowMaintForm(f => !f)}
              className="px-3 py-1.5 rounded-lg text-white text-xs font-medium hover:opacity-90 transition-opacity"
              style={{ backgroundColor: companyColor }}
            >
              {showMaintForm ? 'Cancel' : '+ Add Record'}
            </button>
          </div>

          {showMaintForm && (
            <form onSubmit={handleAddMaintenance} className="px-5 py-4 border-b border-gray-100 bg-gray-50 space-y-3">
              <p className="text-xs font-semibold text-gray-600">New Maintenance Record</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Date <span className="text-red-500">*</span></label>
                  <input type="date" required value={maintForm.date} onChange={e => setMaintForm(f => ({ ...f, date: e.target.value }))} className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Type</label>
                  <select value={maintForm.type} onChange={e => setMaintForm(f => ({ ...f, type: e.target.value }))} className={inputCls}>
                    {MAINTENANCE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Vendor</label>
                  <input type="text" value={maintForm.vendor} onChange={e => setMaintForm(f => ({ ...f, vendor: e.target.value }))} placeholder="Shop name" className={inputCls} />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Description <span className="text-red-500">*</span></label>
                  <input type="text" required value={maintForm.description} onChange={e => setMaintForm(f => ({ ...f, description: e.target.value }))} placeholder="What was done?" className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Cost</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">$</span>
                    <input type="number" value={maintForm.cost} onChange={e => setMaintForm(f => ({ ...f, cost: e.target.value }))} placeholder="0.00" min="0" step="0.01" className="block w-full border border-gray-300 rounded-lg pl-6 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#002D5B]" />
                  </div>
                </div>
                {isVehicle && (
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Mileage</label>
                    <input type="number" value={maintForm.mileage} onChange={e => setMaintForm(f => ({ ...f, mileage: e.target.value }))} placeholder="Current miles" min="0" className={inputCls} />
                  </div>
                )}
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setShowMaintForm(false)} className="px-4 py-2 border border-gray-300 rounded-lg text-xs font-medium text-gray-600 hover:bg-white transition-colors">
                  Cancel
                </button>
                <button type="submit" disabled={savingMaint} className="px-4 py-2 rounded-lg text-white text-xs font-semibold disabled:opacity-40 hover:opacity-90 transition-opacity" style={{ backgroundColor: companyColor }}>
                  {savingMaint ? 'Saving...' : 'Add Record'}
                </button>
              </div>
            </form>
          )}

          {maintenance.length === 0 ? (
            <div className="px-5 py-8 text-center">
              <p className="text-sm text-gray-400">No maintenance records yet.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px]">
                <thead>
                  <tr className="text-left text-xs font-semibold text-gray-500 border-b border-gray-100">
                    <th className="px-4 py-2.5">Date</th>
                    <th className="px-4 py-2.5">Type</th>
                    <th className="px-4 py-2.5">Description</th>
                    <th className="px-4 py-2.5">Vendor</th>
                    <th className="px-4 py-2.5 text-right">Cost</th>
                    {isVehicle && <th className="px-4 py-2.5 text-right">Miles</th>}
                    <th className="px-4 py-2.5 w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {maintenance.map((rec, i) => (
                    <tr key={rec.id} className={`text-sm hover:bg-gray-50 transition-colors ${i % 2 === 1 ? 'bg-[#002D5B]/[0.02]' : ''}`}>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{formatDate(rec.date)}</td>
                      <td className="px-4 py-3 text-gray-700 font-medium whitespace-nowrap">{rec.type}</td>
                      <td className="px-4 py-3 text-gray-600">{rec.description}</td>
                      <td className="px-4 py-3 text-gray-500">{rec.vendor || '—'}</td>
                      <td className="px-4 py-3 text-right text-gray-600 tabular-nums">{rec.cost != null ? formatCurrency(rec.cost) : '—'}</td>
                      {isVehicle && <td className="px-4 py-3 text-right text-gray-500 tabular-nums">{rec.mileage?.toLocaleString() || '—'}</td>}
                      <td className="px-4 py-3 text-right">
                        <button onClick={() => handleDeleteMaintenance(rec.id)} className="text-gray-300 hover:text-red-400 transition-colors text-xs">✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ── INSPECTION LOG (vehicles only) ── */}
        {isVehicle && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-gray-700">Inspection Log</h2>
                <span className="text-xs text-gray-400">({inspections.length})</span>
              </div>
              <button
                onClick={() => {
                  setShowInspForm(f => !f)
                  if (!showInspForm) setInspForm(f => ({ ...f, driver: asset.assignedTo || '' }))
                }}
                className="px-3 py-1.5 rounded-lg text-white text-xs font-medium hover:opacity-90 transition-opacity"
                style={{ backgroundColor: companyColor }}
              >
                {showInspForm ? 'Cancel' : '+ Add Inspection'}
              </button>
            </div>

            {showInspForm && (
              <form onSubmit={handleAddInspection} className="px-5 py-4 border-b border-gray-100 bg-gray-50 space-y-3">
                <p className="text-xs font-semibold text-gray-600">New Inspection</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Date <span className="text-red-500">*</span></label>
                    <input type="date" required value={inspForm.date} onChange={e => setInspForm(f => ({ ...f, date: e.target.value }))} className={inputCls} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Driver at Time of Inspection <span className="text-red-500">*</span></label>
                    <input
                      type="text" required
                      value={inspForm.driver}
                      onChange={e => setInspForm(f => ({ ...f, driver: e.target.value }))}
                      placeholder="Driver name"
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Odometer (miles)</label>
                    <input type="number" value={inspForm.mileage} onChange={e => setInspForm(f => ({ ...f, mileage: e.target.value }))} placeholder="Current miles" min="0" className={inputCls} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Photos</label>
                    <input
                      ref={fileInputRef}
                      type="file" multiple accept="image/*"
                      onChange={e => setInspFiles(Array.from(e.target.files ?? []))}
                      className="block w-full text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:text-white file:cursor-pointer hover:file:opacity-90"
                      style={{ '--file-bg': companyColor } as React.CSSProperties}
                    />
                    {inspFiles.length > 0 && (
                      <p className="text-xs text-gray-400 mt-1">{inspFiles.length} photo{inspFiles.length > 1 ? 's' : ''} selected</p>
                    )}
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
                    <textarea
                      value={inspForm.notes}
                      onChange={e => setInspForm(f => ({ ...f, notes: e.target.value }))}
                      rows={2} placeholder="Inspection notes, issues found, overall condition..."
                      className="block w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#002D5B] resize-none"
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => setShowInspForm(false)} className="px-4 py-2 border border-gray-300 rounded-lg text-xs font-medium text-gray-600 hover:bg-white transition-colors">
                    Cancel
                  </button>
                  <button type="submit" disabled={savingInsp} className="px-4 py-2 rounded-lg text-white text-xs font-semibold disabled:opacity-40 hover:opacity-90 transition-opacity" style={{ backgroundColor: companyColor }}>
                    {savingInsp ? 'Saving...' : 'Save Inspection'}
                  </button>
                </div>
              </form>
            )}

            {inspections.length === 0 ? (
              <div className="px-5 py-8 text-center">
                <p className="text-sm text-gray-400">No inspections logged yet.</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {inspections.map((rec, i) => (
                  <div key={rec.id} className={`px-5 py-4 ${i % 2 === 1 ? 'bg-[#002D5B]/[0.02]' : ''}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-3 flex-wrap">
                          <span className="text-sm font-medium text-gray-900">{formatDate(rec.date)}</span>
                          <span className="text-xs text-gray-500">Driver: <span className="font-medium text-gray-700">{rec.driver}</span></span>
                          {rec.mileage && <span className="text-xs text-gray-400">{rec.mileage.toLocaleString()} mi</span>}
                        </div>
                        {rec.notes && <p className="text-sm text-gray-600 mt-1">{rec.notes}</p>}
                        {rec.photos.length > 0 && (
                          <div className="flex gap-2 mt-2 flex-wrap">
                            {rec.photos.map((url, pi) => (
                              <a key={pi} href={url} target="_blank" rel="noopener noreferrer">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={url} alt={`Inspection photo ${pi + 1}`}
                                  className="w-16 h-16 object-cover rounded-lg border border-gray-200 hover:opacity-80 transition-opacity"
                                />
                              </a>
                            ))}
                          </div>
                        )}
                      </div>
                      <button
                        onClick={() => handleDeleteInspection(rec.id)}
                        className="text-gray-300 hover:text-red-400 transition-colors text-xs shrink-0 mt-0.5"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── FUEL TRANSACTIONS (vehicles with WEX card) ── */}
        {isVehicle && asset.fuelCardNumber && (() => {
          const now = new Date()
          const thisMonth = wexTransactions.filter(t => {
            const d = new Date(t.date)
            return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
          })
          const ytd = wexTransactions.filter(t => new Date(t.date).getFullYear() === now.getFullYear())
          const monthSpend  = thisMonth.reduce((s, t) => s + t.totalAmount, 0)
          const ytdSpend    = ytd.reduce((s, t) => s + t.totalAmount, 0)
          const ytdGallons  = ytd.reduce((s, t) => s + (t.gallons ?? 0), 0)

          return (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-semibold text-gray-700">Fuel Transactions</h2>
                  <span className="text-xs text-gray-400">Card #{asset.fuelCardNumber}</span>
                  <span className="text-xs text-gray-400">({wexTransactions.length})</span>
                </div>
                {wexTransactions.length > 0 && (
                  <div className="flex gap-4 text-xs text-gray-500">
                    <span>This month: <span className="font-semibold text-gray-800">${monthSpend.toFixed(2)}</span></span>
                    <span>YTD: <span className="font-semibold text-gray-800">${ytdSpend.toFixed(2)}</span></span>
                    <span>YTD gallons: <span className="font-semibold text-gray-800">{ytdGallons.toFixed(1)}</span></span>
                  </div>
                )}
              </div>

              {wexTransactions.length === 0 ? (
                <div className="px-5 py-8 text-center">
                  <p className="text-sm text-gray-400">No fuel transactions yet.</p>
                  <p className="text-xs text-gray-300 mt-1">Import a WEX CSV from the Fuel tab, or transactions will appear automatically once the WEX API is connected.</p>
                </div>
              ) : (() => {
                const visible = showAllFuel ? wexTransactions : wexTransactions.slice(0, 5)
                const hidden  = wexTransactions.length - 5
                return (
                  <>
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[560px]">
                        <thead>
                          <tr className="text-left text-xs font-semibold text-gray-500 border-b border-gray-100">
                            <th className="px-4 py-2.5">Date</th>
                            <th className="px-4 py-2.5">Station</th>
                            <th className="px-4 py-2.5">Product</th>
                            <th className="px-4 py-2.5 text-right">Gallons</th>
                            <th className="px-4 py-2.5 text-right">$/Gal</th>
                            <th className="px-4 py-2.5 text-right">Total</th>
                            <th className="px-4 py-2.5 text-right">Odometer</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {visible.map((txn, i) => (
                            <tr key={txn.id} className={`text-sm hover:bg-gray-50 transition-colors ${i % 2 === 1 ? 'bg-[#002D5B]/[0.02]' : ''}`}>
                              <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                                {new Date(txn.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                              </td>
                              <td className="px-4 py-3 text-gray-700">
                                {txn.merchantName || '—'}
                                {txn.merchantCity && <span className="text-gray-400 ml-1 text-xs">{txn.merchantCity}{txn.merchantState ? `, ${txn.merchantState}` : ''}</span>}
                              </td>
                              <td className="px-4 py-3 text-gray-500">{txn.productType || '—'}</td>
                              <td className="px-4 py-3 text-right text-gray-600 tabular-nums">{txn.gallons != null ? txn.gallons.toFixed(3) : '—'}</td>
                              <td className="px-4 py-3 text-right text-gray-500 tabular-nums">{txn.pricePerGallon != null ? `$${txn.pricePerGallon.toFixed(3)}` : '—'}</td>
                              <td className="px-4 py-3 text-right font-medium text-gray-700 tabular-nums">${txn.totalAmount.toFixed(2)}</td>
                              <td className="px-4 py-3 text-right text-gray-400 tabular-nums">{txn.odometer?.toLocaleString() || '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {hidden > 0 && (
                      <button
                        onClick={() => setShowAllFuel(s => !s)}
                        className="w-full px-5 py-2.5 text-xs font-medium text-gray-500 hover:text-gray-700 hover:bg-gray-50 border-t border-gray-100 transition-colors text-center"
                      >
                        {showAllFuel ? '▲ Show less' : `▼ Show ${hidden} more transaction${hidden !== 1 ? 's' : ''}`}
                      </button>
                    )}
                  </>
                )
              })()}
            </div>
          )
        })()}

      </main>
    </div>
  )
}
