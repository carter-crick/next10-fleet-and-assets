'use client'

import { useRef, useState } from 'react'
import CompanyNav from './CompanyNav'
import type { Company } from '@/lib/types'

interface ImportResult {
  total: number
  matched: number
  imported: number
  skipped: number
  unmatched: number
  autoUpdated: number
}

export default function WexImportPage({ company }: { company: Company }) {
  const companyColor = company === 'balanced-comfort' ? '#002D5B' : '#0f766e'
  const [file, setFile]         = useState<File | null>(null)
  const [dragging, setDragging] = useState(false)
  const [loading, setLoading]   = useState(false)
  const [result, setResult]     = useState<ImportResult | null>(null)
  const [error, setError]       = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    const f = e.dataTransfer.files[0]
    if (f?.name.endsWith('.csv')) { setFile(f); setResult(null); setError(null) }
    else setError('Please drop a .csv file.')
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null
    setFile(f); setResult(null); setError(null)
  }

  async function handleImport() {
    if (!file) return
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const form = new FormData()
      form.append('file', file)
      const res  = await fetch('/api/wex/import', { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Import failed.')
        if (data.detectedHeaders) {
          setError(prev => `${prev}\n\nDetected columns: ${data.detectedHeaders.join(', ')}`)
        }
      } else {
        setResult(data)
      }
    } catch {
      setError('Network error — please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <CompanyNav company={company} />

      <main className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Import WEX Fuel Transactions</h1>
          <p className="text-sm text-gray-500 mt-1">Upload a CSV export from WEX EFM to load transaction history into the app.</p>
        </div>

        {/* How-to instructions */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
          <h2 className="text-sm font-semibold text-gray-700">How to export from WEX EFM</h2>
          <ol className="text-sm text-gray-600 space-y-2 list-decimal list-inside">
            <li>Log in at <span className="font-medium">wexefm.com</span></li>
            <li>Click <span className="font-medium">Transactions</span> in the top navigation</li>
            <li>Set your date range and click <span className="font-medium">Search</span></li>
            <li>Export as <span className="font-medium">CSV</span> — upload the full file, no column changes needed</li>
          </ol>
          <p className="text-xs text-gray-400 mt-1">
            Vehicles are matched by VIN. If a vehicle doesn&apos;t have a Fuel Card # set yet, it will be filled in automatically on first import.
          </p>
        </div>

        {/* Upload zone */}
        <div
          className={`bg-white rounded-xl border-2 border-dashed transition-colors p-8 text-center cursor-pointer ${
            dragging
              ? 'border-[var(--color)] bg-[color-mix(in_srgb,var(--color)_5%,white)]'
              : 'border-gray-300 hover:border-gray-400'
          }`}
          style={{ '--color': companyColor } as React.CSSProperties}
          onDragOver={e => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={onFileChange}
          />
          {file ? (
            <div className="space-y-1">
              <p className="text-sm font-medium text-gray-700">{file.name}</p>
              <p className="text-xs text-gray-400">{(file.size / 1024).toFixed(1)} KB — click to change</p>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="text-3xl text-gray-300">↑</div>
              <p className="text-sm text-gray-500">Drop your WEX CSV here, or click to browse</p>
              <p className="text-xs text-gray-400">.csv files only</p>
            </div>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-4">
            <p className="text-sm font-medium text-red-700 whitespace-pre-line">{error}</p>
          </div>
        )}

        {/* Result */}
        {result && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-700">Import complete</h2>
            </div>
            <div className="px-5 py-4 grid grid-cols-2 sm:grid-cols-4 gap-4">
              <Stat label="Rows in CSV" value={result.total} />
              <Stat label="Matched to vehicles" value={result.matched} />
              <Stat
                label="Imported"
                value={result.imported}
                highlight={result.imported > 0}
                color={companyColor}
              />
              <Stat label="Skipped (duplicates)" value={result.skipped} />
            </div>
            {(result.autoUpdated > 0 || result.unmatched > 0 || result.imported > 0) && (
              <div className="px-5 pb-4 space-y-1.5">
                {result.autoUpdated > 0 && (
                  <p className="text-xs text-green-700">
                    {result.autoUpdated} vehicle{result.autoUpdated !== 1 ? 's' : ''} had their Fuel Card # automatically set from this import.
                  </p>
                )}
                {result.imported > 0 && (
                  <p className="text-xs text-gray-400">
                    Transactions now appear on each vehicle&apos;s detail page under Fuel Transactions.
                  </p>
                )}
                {result.unmatched > 0 && (
                  <p className="text-xs text-amber-600">
                    {result.unmatched} row{result.unmatched !== 1 ? 's' : ''} could not be matched — those vehicles may not be in the app yet, or their VIN may not be set.
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Submit */}
        {file && !result && (
          <button
            onClick={handleImport}
            disabled={loading}
            className="w-full py-3 rounded-xl text-sm font-semibold text-white transition-opacity disabled:opacity-60"
            style={{ backgroundColor: companyColor }}
          >
            {loading ? 'Importing…' : `Import ${file.name}`}
          </button>
        )}

        {result && (
          <button
            onClick={() => { setFile(null); setResult(null); if (inputRef.current) inputRef.current.value = '' }}
            className="w-full py-3 rounded-xl text-sm font-semibold text-gray-600 bg-white border border-gray-300 hover:bg-gray-50 transition-colors"
          >
            Import another file
          </button>
        )}
      </main>
    </div>
  )
}

function Stat({ label, value, highlight, color }: {
  label: string; value: number; highlight?: boolean; color?: string
}) {
  return (
    <div>
      <p className="text-xs text-gray-400 mb-0.5">{label}</p>
      <p
        className="text-2xl font-bold tabular-nums"
        style={highlight && color ? { color } : undefined}
      >
        {value.toLocaleString()}
      </p>
    </div>
  )
}
