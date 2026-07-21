'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import CompanyNav from './CompanyNav'
import type { AssetStatus, AssetType, Company, Driver } from '@/lib/types'

const ASSET_TYPES: { value: AssetType; label: string }[] = [
  { value: 'vehicle',   label: 'Vehicle'   },
  { value: 'equipment', label: 'Equipment' },
  { value: 'trailer',   label: 'Trailer'   },
]

const STATUS_OPTIONS: { value: AssetStatus; label: string }[] = [
  { value: 'active',         label: 'Active'          },
  { value: 'open',           label: 'Open'            },
  { value: 'maintenance',    label: 'In Maintenance'  },
  { value: 'out-of-service', label: 'Out of Service'  },
  { value: 'retired',        label: 'Retired'         },
]

const EMPTY_FORM = {
  name: '', make: '', model: '', year: '', vin: '', serialNumber: '',
  licensePlate: '', licensePlateExpiration: '', color: '', lender: '',
  fuelCardNumber: '', nttaNumber: '', inServiceDate: '',
  status: 'active' as AssetStatus,
  assignedTo: '', location: '', mileage: '',
  purchaseDate: '', purchasePrice: '',
  lastServiceDate: '', nextServiceDue: '', notes: '',
}

export default function AddAssetPage({ company }: { company: Company }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const initialType = (searchParams.get('type') as AssetType) || 'vehicle'

  const companyColor = company === 'balanced-comfort' ? '#002D5B' : '#0A344C'

  const [saving, setSaving] = useState(false)
  const [type, setType] = useState<AssetType>(initialType)
  const [form, setForm] = useState(EMPTY_FORM)
  const [drivers, setDrivers] = useState<Driver[]>([])

  useEffect(() => {
    fetch(`/api/drivers?company=${company}`)
      .then(r => r.json())
      .then(data => setDrivers(Array.isArray(data) ? data : []))
  }, [company])

  function set(field: keyof typeof EMPTY_FORM, value: string) {
    setForm(f => ({ ...f, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) return
    setSaving(true)
    try {
      const payload = {
        company, type,
        name: form.name.trim(),
        ...(form.make        && { make: form.make }),
        ...(form.model       && { model: form.model }),
        ...(form.year        && { year: parseInt(form.year) }),
        ...(form.vin         && { vin: form.vin }),
        ...(form.serialNumber && { serialNumber: form.serialNumber }),
        ...(form.licensePlate           && { licensePlate: form.licensePlate }),
        ...(form.licensePlateExpiration && { licensePlateExpiration: form.licensePlateExpiration }),
        ...(form.color                  && { color: form.color }),
        ...(form.lender                 && { lender: form.lender }),
        ...(form.fuelCardNumber         && { fuelCardNumber: form.fuelCardNumber }),
        ...(form.nttaNumber             && { nttaNumber: form.nttaNumber }),
        ...(form.inServiceDate          && { inServiceDate: form.inServiceDate }),
        status: form.status,
        ...(form.assignedTo  && { assignedTo: form.assignedTo }),
        ...(form.location    && { location: form.location }),
        ...(form.mileage     && { mileage: parseInt(form.mileage) }),
        ...(form.purchaseDate  && { purchaseDate: form.purchaseDate }),
        ...(form.purchasePrice && { purchasePrice: parseFloat(form.purchasePrice) }),
        ...(form.lastServiceDate && { lastServiceDate: form.lastServiceDate }),
        ...(form.nextServiceDue  && { nextServiceDue: form.nextServiceDue }),
        ...(form.notes       && { notes: form.notes }),
      }
      const res = await fetch('/api/assets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error('Failed')
      const asset = await res.json()
      router.push(`/${company}/${asset.id}`)
    } catch {
      alert('Failed to save asset. Please try again.')
      setSaving(false)
    }
  }

  const isVehicleOrTrailer = type === 'vehicle' || type === 'trailer'
  const isVehicle = type === 'vehicle'

  const inputCls = 'block w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#002D5B]'
  const labelCls = 'block text-sm font-medium text-gray-700 mb-1'

  return (
    <div className="min-h-screen bg-gray-50">
      <CompanyNav company={company} />
      <main className="max-w-3xl mx-auto px-6 py-8">

        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => router.back()} className="text-sm text-gray-400 hover:text-gray-600 transition-colors">
            ← Back
          </button>
          <h1 className="text-xl font-semibold text-gray-900">Add Asset</h1>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">

          {/* Type & Status */}
          <section className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
            <h2 className="text-sm font-semibold text-gray-700">Type & Status</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Asset Type <span className="text-red-500">*</span></label>
                <div className="flex gap-2">
                  {ASSET_TYPES.map(t => (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => setType(t.value)}
                      className="flex-1 py-2 px-3 rounded-lg text-sm font-medium border transition-colors"
                      style={type === t.value
                        ? { backgroundColor: companyColor, color: 'white', borderColor: 'transparent' }
                        : { backgroundColor: 'white', color: '#374151', borderColor: '#e5e7eb' }
                      }
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className={labelCls}>Status</label>
                <select value={form.status} onChange={e => set('status', e.target.value)} className={inputCls}>
                  {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            </div>
          </section>

          {/* Basic Info */}
          <section className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
            <h2 className="text-sm font-semibold text-gray-700">Basic Information</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className={labelCls}>Name / Nickname <span className="text-red-500">*</span></label>
                <input
                  type="text" value={form.name} onChange={e => set('name', e.target.value)} required
                  placeholder={
                    type === 'vehicle'   ? "e.g. BC Truck 1, Jake's Van" :
                    type === 'equipment' ? 'e.g. Pipe Threader, Milwaukee Drill' :
                    'e.g. BC Trailer 1'
                  }
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Make / Brand</label>
                <input type="text" value={form.make} onChange={e => set('make', e.target.value)} placeholder="e.g. Ford, Milwaukee" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Model</label>
                <input type="text" value={form.model} onChange={e => set('model', e.target.value)} placeholder="e.g. F-250, M18" className={inputCls} />
              </div>
              {isVehicleOrTrailer && <>
                <div>
                  <label className={labelCls}>Year</label>
                  <input type="number" value={form.year} onChange={e => set('year', e.target.value)} placeholder="e.g. 2022" min="1990" max="2030" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Color</label>
                  <input type="text" value={form.color} onChange={e => set('color', e.target.value)} placeholder="e.g. White, Silver" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>License Plate</label>
                  <input type="text" value={form.licensePlate} onChange={e => set('licensePlate', e.target.value)} placeholder="e.g. ABC1234" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Plate Expiration</label>
                  <input type="date" value={form.licensePlateExpiration} onChange={e => set('licensePlateExpiration', e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>VIN</label>
                  <input type="text" value={form.vin} onChange={e => set('vin', e.target.value)} placeholder="17-character VIN" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Lender</label>
                  <input type="text" value={form.lender} onChange={e => set('lender', e.target.value)} placeholder="e.g. Enterprise Fleet, Company Owned" className={inputCls} />
                </div>
                {isVehicle && (
                  <div>
                    <label className={labelCls}>Fuel Card #</label>
                    <input type="text" value={form.fuelCardNumber} onChange={e => set('fuelCardNumber', e.target.value)} placeholder="e.g. 40972" className={inputCls} />
                  </div>
                )}
                {isVehicle && (
                  <div>
                    <label className={labelCls}>NTTA # (Toll)</label>
                    <input type="text" value={form.nttaNumber} onChange={e => set('nttaNumber', e.target.value)} placeholder="e.g. 866000012345" className={inputCls} />
                  </div>
                )}
              </>}
              {!isVehicleOrTrailer && (
                <div>
                  <label className={labelCls}>Serial Number</label>
                  <input type="text" value={form.serialNumber} onChange={e => set('serialNumber', e.target.value)} placeholder="Manufacturer serial number" className={inputCls} />
                </div>
              )}
            </div>
          </section>

          {/* Assignment */}
          <section className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
            <h2 className="text-sm font-semibold text-gray-700">Assignment & Location</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Assigned To</label>
                {isVehicle ? (
                  <select value={form.assignedTo} onChange={e => set('assignedTo', e.target.value)} className={inputCls}>
                    <option value="">— Unassigned —</option>
                    {drivers.map(d => (
                      <option key={d.id} value={d.name}>{d.name}</option>
                    ))}
                    {drivers.length === 0 && (
                      <option disabled>No drivers added yet</option>
                    )}
                  </select>
                ) : (
                  <input type="text" value={form.assignedTo} onChange={e => set('assignedTo', e.target.value)} placeholder="Employee name" className={inputCls} />
                )}
              </div>
              <div>
                <label className={labelCls}>Location</label>
                <input type="text" value={form.location} onChange={e => set('location', e.target.value)} placeholder="e.g. Main Warehouse, Truck 3" className={inputCls} />
              </div>
              {isVehicle && (
                <div>
                  <label className={labelCls}>Current Mileage</label>
                  <input type="number" value={form.mileage} onChange={e => set('mileage', e.target.value)} placeholder="e.g. 45000" min="0" className={inputCls} />
                </div>
              )}
            </div>
          </section>

          {/* Service */}
          <section className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
            <h2 className="text-sm font-semibold text-gray-700">Service & Maintenance</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Last Service Date</label>
                <input type="date" value={form.lastServiceDate} onChange={e => set('lastServiceDate', e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Next Service Due</label>
                <input type="date" value={form.nextServiceDue} onChange={e => set('nextServiceDue', e.target.value)} className={inputCls} />
              </div>
            </div>
          </section>

          {/* Purchase */}
          <section className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
            <h2 className="text-sm font-semibold text-gray-700">Purchase Information</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Purchase Date</label>
                <input type="date" value={form.purchaseDate} onChange={e => set('purchaseDate', e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Purchase Price</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                  <input type="number" value={form.purchasePrice} onChange={e => set('purchasePrice', e.target.value)} placeholder="0.00" min="0" step="0.01" className="block w-full border border-gray-300 rounded-lg pl-7 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#002D5B]" />
                </div>
              </div>
              <div>
                <label className={labelCls}>In Service Date</label>
                <input type="date" value={form.inServiceDate} onChange={e => set('inServiceDate', e.target.value)} className={inputCls} />
              </div>
            </div>
          </section>

          {/* Notes */}
          <section className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
            <h2 className="text-sm font-semibold text-gray-700">Notes</h2>
            <textarea
              value={form.notes} onChange={e => set('notes', e.target.value)}
              rows={3} placeholder="Any additional notes..."
              className="block w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#002D5B] resize-none"
            />
          </section>

          <div className="flex gap-3 justify-end pb-8">
            <button
              type="button" onClick={() => router.back()}
              className="px-5 py-2.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit" disabled={saving || !form.name.trim()}
              className="px-5 py-2.5 rounded-lg text-white text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
              style={{ backgroundColor: companyColor }}
            >
              {saving ? 'Saving...' : 'Add Asset'}
            </button>
          </div>

        </form>
      </main>
    </div>
  )
}
