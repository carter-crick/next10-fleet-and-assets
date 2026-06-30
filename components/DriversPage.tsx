'use client'

import { useEffect, useState } from 'react'
import CompanyNav from './CompanyNav'
import type { Company, Driver } from '@/lib/types'

type DLStatus = 'valid' | 'expiring' | 'expired'

function dlStatus(expDate: string): DLStatus {
  const exp = new Date(expDate + 'T00:00:00')
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const in90Days = new Date(today.getTime() + 90 * 24 * 60 * 60 * 1000)
  if (exp < today) return 'expired'
  if (exp <= in90Days) return 'expiring'
  return 'valid'
}

function daysUntil(dateStr: string) {
  const exp = new Date(dateStr + 'T00:00:00')
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.ceil((exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}

function formatDate(dateStr: string) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

const DL_STATUS_CONFIG: Record<DLStatus, { label: string; className: string }> = {
  valid:    { label: 'Valid',           className: 'bg-green-100 text-green-700' },
  expiring: { label: 'Expiring Soon',   className: 'bg-yellow-100 text-yellow-700' },
  expired:  { label: 'Expired',         className: 'bg-red-100 text-red-700' },
}

const EMPTY_FORM = { name: '', dlNumber: '', dlExpiration: '' }

export default function DriversPage({ company }: { company: Company }) {
  const companyColor = company === 'balanced-comfort' ? '#002D5B' : '#0f766e'

  const [drivers, setDrivers] = useState<Driver[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showAddForm, setShowAddForm] = useState(false)
  const [addForm, setAddForm] = useState(EMPTY_FORM)
  const [savingAdd, setSavingAdd] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState(EMPTY_FORM)
  const [savingEdit, setSavingEdit] = useState(false)

  useEffect(() => {
    fetch(`/api/drivers?company=${company}`)
      .then(r => r.json())
      .then(data => { setDrivers(data); setLoading(false) })
  }, [company])

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!addForm.name.trim() || !addForm.dlNumber.trim() || !addForm.dlExpiration) return
    setSavingAdd(true)
    try {
      const res = await fetch('/api/drivers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company, name: addForm.name.trim(), dlNumber: addForm.dlNumber.trim(), dlExpiration: addForm.dlExpiration }),
      })
      if (!res.ok) throw new Error('Failed')
      const driver = await res.json()
      setDrivers(d => [...d, driver].sort((a, b) => a.name.localeCompare(b.name)))
      setAddForm(EMPTY_FORM)
      setShowAddForm(false)
    } catch {
      alert('Failed to save. Please try again.')
    } finally {
      setSavingAdd(false)
    }
  }

  function startEdit(driver: Driver) {
    setEditingId(driver.id)
    setEditForm({ name: driver.name, dlNumber: driver.dlNumber, dlExpiration: driver.dlExpiration })
  }

  async function handleSaveEdit(id: string) {
    if (!editForm.name.trim() || !editForm.dlNumber.trim() || !editForm.dlExpiration) return
    setSavingEdit(true)
    try {
      const res = await fetch(`/api/drivers/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company, name: editForm.name.trim(), dlNumber: editForm.dlNumber.trim(), dlExpiration: editForm.dlExpiration }),
      })
      if (!res.ok) throw new Error('Failed')
      const updated = await res.json()
      setDrivers(d => d.map(dr => dr.id === id ? updated : dr))
      setEditingId(null)
    } catch {
      alert('Failed to save. Please try again.')
    } finally {
      setSavingEdit(false)
    }
  }

  async function handleDelete(driver: Driver) {
    if (!confirm(`Remove ${driver.name} from the roster?`)) return
    await fetch(`/api/drivers/${driver.id}?company=${company}`, { method: 'DELETE' })
    setDrivers(d => d.filter(dr => dr.id !== driver.id))
  }

  const expired  = drivers.filter(d => dlStatus(d.dlExpiration) === 'expired')
  const expiring = drivers.filter(d => dlStatus(d.dlExpiration) === 'expiring')

  const filteredDrivers = drivers.filter(d => {
    const q = search.toLowerCase()
    return !q || d.name.toLowerCase().includes(q) || d.dlNumber.toLowerCase().includes(q)
  })

  const inputCls = 'block w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#002D5B]'

  return (
    <div className="min-h-screen bg-gray-50">
      <CompanyNav company={company} />
      <main className="max-w-4xl mx-auto px-6 py-8 space-y-5">

        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-gray-900">Drivers</h1>
          <button
            onClick={() => { setShowAddForm(f => !f); setAddForm(EMPTY_FORM) }}
            className="px-4 py-2 rounded-lg text-white text-sm font-medium hover:opacity-90 transition-opacity"
            style={{ backgroundColor: companyColor }}
          >
            {showAddForm ? 'Cancel' : '+ Add Driver'}
          </button>
        </div>

        {/* Alerts */}
        {(expired.length > 0 || expiring.length > 0) && (
          <div className="space-y-2">
            {expired.length > 0 && (
              <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
                <span className="font-semibold">⚠ {expired.length} expired license{expired.length > 1 ? 's' : ''}:</span>
                <span>{expired.map(d => d.name).join(', ')}</span>
              </div>
            )}
            {expiring.length > 0 && (
              <div className="flex items-center gap-2 px-4 py-3 bg-yellow-50 border border-yellow-200 rounded-xl text-sm text-yellow-700">
                <span className="font-semibold">⚠ {expiring.length} license{expiring.length > 1 ? 's' : ''} expiring within 90 days:</span>
                <span>{expiring.map(d => `${d.name} (${daysUntil(d.dlExpiration)}d)`).join(', ')}</span>
              </div>
            )}
          </div>
        )}

        {/* Add form */}
        {showAddForm && (
          <form onSubmit={handleAdd} className="bg-white rounded-xl border border-gray-200 p-5">
            <p className="text-sm font-semibold text-gray-700 mb-4">New Driver</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Full Name <span className="text-red-500">*</span></label>
                <input
                  type="text" required autoFocus
                  value={addForm.name} onChange={e => setAddForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Jake Wright"
                  className={inputCls}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">DL # <span className="text-red-500">*</span></label>
                <input
                  type="text" required
                  value={addForm.dlNumber} onChange={e => setAddForm(f => ({ ...f, dlNumber: e.target.value }))}
                  placeholder="e.g. D1234567"
                  className={inputCls}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">DL Expiration <span className="text-red-500">*</span></label>
                <input
                  type="date" required
                  value={addForm.dlExpiration} onChange={e => setAddForm(f => ({ ...f, dlExpiration: e.target.value }))}
                  className={inputCls}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button type="button" onClick={() => setShowAddForm(false)} className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">
                Cancel
              </button>
              <button type="submit" disabled={savingAdd} className="px-4 py-2 rounded-lg text-white text-sm font-semibold disabled:opacity-40 hover:opacity-90 transition-opacity" style={{ backgroundColor: companyColor }}>
                {savingAdd ? 'Saving...' : 'Add Driver'}
              </button>
            </div>
          </form>
        )}

        {/* Search */}
        {!loading && drivers.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-4 flex gap-3 flex-wrap items-center">
            <input
              type="text"
              placeholder="Search drivers..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="flex-1 min-w-44 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#002D5B]"
            />
            <span className="text-xs text-gray-400 shrink-0">{filteredDrivers.length} of {drivers.length}</span>
          </div>
        )}

        {/* Table */}
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <p className="text-gray-400 text-sm">Loading...</p>
          </div>
        ) : drivers.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <p className="text-gray-400 text-lg mb-1">No drivers yet</p>
            <p className="text-sm text-gray-400 mb-5">Add drivers to assign them to vehicles.</p>
            <button
              onClick={() => setShowAddForm(true)}
              className="px-6 py-2.5 rounded-lg text-white text-sm font-medium hover:opacity-90 transition-opacity"
              style={{ backgroundColor: companyColor }}
            >
              + Add first driver
            </button>
          </div>
        ) : filteredDrivers.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <p className="text-gray-400 text-lg mb-1">No drivers match &quot;{search}&quot;</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="text-left text-xs font-semibold text-white" style={{ backgroundColor: companyColor }}>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">DL #</th>
                  <th className="px-4 py-3">DL Expiration</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 w-28"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredDrivers.map((driver, i) => {
                  const status = dlStatus(driver.dlExpiration)
                  const { label, className } = DL_STATUS_CONFIG[status]
                  const days = daysUntil(driver.dlExpiration)
                  const isEditing = editingId === driver.id

                  if (isEditing) {
                    return (
                      <tr key={driver.id} className="bg-blue-50/40">
                        <td className="px-3 py-2">
                          <input
                            type="text" value={editForm.name}
                            onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                            className={inputCls} autoFocus
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="text" value={editForm.dlNumber}
                            onChange={e => setEditForm(f => ({ ...f, dlNumber: e.target.value }))}
                            className={inputCls}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="date" value={editForm.dlExpiration}
                            onChange={e => setEditForm(f => ({ ...f, dlExpiration: e.target.value }))}
                            className={inputCls}
                          />
                        </td>
                        <td className="px-3 py-2"></td>
                        <td className="px-3 py-2">
                          <div className="flex gap-1.5 justify-end">
                            <button
                              onClick={() => setEditingId(null)}
                              className="px-2.5 py-1 border border-gray-300 rounded-lg text-xs font-medium text-gray-600 hover:bg-white transition-colors"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={() => handleSaveEdit(driver.id)}
                              disabled={savingEdit}
                              className="px-2.5 py-1 rounded-lg text-white text-xs font-semibold disabled:opacity-40 hover:opacity-90 transition-opacity"
                              style={{ backgroundColor: companyColor }}
                            >
                              {savingEdit ? '...' : 'Save'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  }

                  return (
                    <tr key={driver.id} className={`hover:bg-gray-50 transition-colors ${i % 2 === 1 ? 'bg-[#002D5B]/[0.02]' : ''}`}>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">{driver.name}</td>
                      <td className="px-4 py-3 text-sm text-gray-600 font-mono">{driver.dlNumber}</td>
                      <td className="px-4 py-3 text-sm">
                        <span className={status !== 'valid' ? 'font-medium ' + (status === 'expired' ? 'text-red-600' : 'text-orange-500') : 'text-gray-600'}>
                          {formatDate(driver.dlExpiration)}
                        </span>
                        {status === 'expiring' && (
                          <span className="ml-2 text-xs text-orange-400">({days}d)</span>
                        )}
                        {status === 'expired' && (
                          <span className="ml-2 text-xs text-red-400">({Math.abs(days)}d ago)</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${className}`}>
                          {label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex gap-1.5 justify-end">
                          <button
                            onClick={() => startEdit(driver)}
                            className="px-2.5 py-1 border border-gray-200 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-100 transition-colors"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDelete(driver)}
                            className="px-2.5 py-1 border border-red-100 rounded-lg text-xs font-medium text-red-500 hover:bg-red-50 transition-colors"
                          >
                            Remove
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  )
}
