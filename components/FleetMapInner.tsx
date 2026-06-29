'use client'

import { useEffect, useRef, useState } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { Company } from '@/lib/types'
import type { FleetVehicle } from '@/app/api/gps/fleet/route'

// ── Marker icons (DivIcon — no image files needed) ─────────────────────────

function markerColor(v: FleetVehicle): string {
  if (v.status === 'out-of-service' || v.status === 'retired') return '#ef4444'
  const mins = Math.floor((Date.now() - new Date(v.receivedAt).getTime()) / 60000)
  if (mins > 60) return '#9ca3af'                          // stale — gray
  if (v.driveStatus === 'driving' || (v.speed ?? 0) > 2) return '#22c55e'  // moving — green
  if (v.driveStatus === 'idle') return '#f59e0b'           // engine on, not moving — amber
  return '#3b82f6'                                         // engine off / stopped — blue
}

function createDivIcon(color: string, heading?: number) {
  const arrow = heading != null && (heading > 10 || heading < 350)
    ? `<div style="
        position:absolute;top:-7px;left:50%;transform:translateX(-50%) rotate(${heading}deg);
        width:0;height:0;
        border-left:4px solid transparent;border-right:4px solid transparent;
        border-bottom:8px solid ${color};
      "></div>`
    : ''
  return L.divIcon({
    html: `<div style="position:relative;width:16px;height:16px;">
      <div style="width:16px;height:16px;background:${color};border:2.5px solid white;border-radius:50%;box-shadow:0 1px 4px rgba(0,0,0,0.35);"></div>
      ${arrow}
    </div>`,
    className: '',
    iconSize:   [16, 16],
    iconAnchor: [8, 8],
    popupAnchor:[0, -10],
  })
}

// ── Auto-fit map bounds ──────────────────────────────────────────────────────

function FitBounds({ vehicles }: { vehicles: FleetVehicle[] }) {
  const map = useMap()
  const fittedCount = useRef(0)

  useEffect(() => {
    // Fit once when data first arrives; don't re-fit on subsequent refreshes
    // so the user can pan freely after initial load
    if (vehicles.length === 0 || fittedCount.current > 0) return
    const bounds = L.latLngBounds(vehicles.map(v => [v.lat, v.lng]))
    map.fitBounds(bounds, { padding: [60, 60], maxZoom: 13 })
    fittedCount.current = vehicles.length
  }, [map, vehicles])

  return null
}

// ── Relative time helper ────────────────────────────────────────────────────

function timeAgo(iso: string) {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1)  return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs  < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

// ── Main component ───────────────────────────────────────────────────────────

export default function FleetMapInner({
  company,
  companyColor,
}: {
  company: Company
  companyColor: string
}) {
  const [vehicles, setVehicles] = useState<FleetVehicle[]>([])
  const [loading, setLoading]   = useState(true)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)

  async function fetchFleet() {
    try {
      const res = await fetch(`/api/gps/fleet?company=${company}`)
      if (res.ok) {
        const data = await res.json()
        setVehicles(Array.isArray(data) ? data : [])
        setLastRefresh(new Date())
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchFleet()
    // Refresh every 60 seconds
    const interval = setInterval(fetchFleet, 60_000)
    return () => clearInterval(interval)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company])

  const moving  = vehicles.filter(v => v.driveStatus === 'driving' || (v.speed ?? 0) > 2)
  const idle    = vehicles.filter(v => v.driveStatus === 'idle'    && (v.speed ?? 0) <= 2)
  const stopped = vehicles.filter(v => v.driveStatus !== 'driving' && v.driveStatus !== 'idle' && (v.speed ?? 0) <= 2)

  return (
    <div className="flex flex-col h-full">

      {/* Status bar */}
      <div className="flex items-center gap-4 px-4 py-2 bg-white border-b border-gray-200 text-xs text-gray-600 flex-wrap">
        <span className="font-semibold text-gray-800">{vehicles.length} tracked</span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-green-500 inline-block" />
          {moving.length} moving
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block" />
          {idle.length} idle
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block" />
          {stopped.length} stopped
        </span>
        <span className="ml-auto text-gray-400">
          {loading ? 'Loading…' : lastRefresh ? `Updated ${timeAgo(lastRefresh.toISOString())}` : ''}
        </span>
        <button
          onClick={fetchFleet}
          className="px-2.5 py-1 rounded-md text-white text-xs font-medium hover:opacity-90 transition-opacity"
          style={{ backgroundColor: companyColor }}
        >
          Refresh
        </button>
      </div>

      {/* Map */}
      <div className="flex-1 relative">
        {loading && (
          <div className="absolute inset-0 z-[1000] flex items-center justify-center bg-white/70">
            <p className="text-sm text-gray-500">Loading fleet locations…</p>
          </div>
        )}

        {!loading && vehicles.length === 0 && (
          <div className="absolute inset-0 z-[1000] flex items-center justify-center bg-white/70">
            <div className="text-center">
              <p className="text-sm font-medium text-gray-700">No location data available</p>
              <p className="text-xs text-gray-400 mt-1">Vehicles report location when moving</p>
            </div>
          </div>
        )}

        <MapContainer
          center={[36.75, -119.77]}  // Fresno, CA — overridden by FitBounds once data loads
          zoom={11}
          style={{ height: '100%', width: '100%' }}
          zoomControl={true}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          <FitBounds vehicles={vehicles} />

          {vehicles.map(v => (
            <Marker
              key={v.deviceId}
              position={[v.lat, v.lng]}
              icon={createDivIcon(markerColor(v), v.heading)}
            >
              <Popup maxWidth={240} className="fleet-popup">
                <div className="text-sm leading-relaxed">
                  <p className="font-semibold text-gray-900 text-base mb-1">{v.name}</p>
                  {v.assignedTo && (
                    <p className="text-gray-500 text-xs mb-2">{v.assignedTo}</p>
                  )}
                  {v.address && (
                    <p className="text-gray-700 mb-2">{v.address}</p>
                  )}
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-600">
                    {v.speed != null && (
                      <>
                        <span className="text-gray-400">Speed</span>
                        <span>{Math.round(v.speed)} mph</span>
                      </>
                    )}
                    {v.odometer != null && (
                      <>
                        <span className="text-gray-400">Odometer</span>
                        <span>{v.odometer.toLocaleString()} mi</span>
                      </>
                    )}
                    {v.fuelPercent != null && (
                      <>
                        <span className="text-gray-400">Fuel</span>
                        <span className={v.fuelPercent < 20 ? 'text-red-500 font-medium' : ''}>{v.fuelPercent}%</span>
                      </>
                    )}
                    <span className="text-gray-400">Last ping</span>
                    <span>{timeAgo(v.receivedAt)}</span>
                  </div>
                  <a
                    href={`/${company}/${v.id}`}
                    className="mt-3 block text-center text-xs font-medium text-white py-1.5 rounded-md hover:opacity-90 transition-opacity"
                    style={{ backgroundColor: companyColor }}
                  >
                    View Vehicle →
                  </a>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 px-4 py-2 bg-white border-t border-gray-200 text-xs text-gray-500 flex-wrap">
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-green-500 inline-block" /> Moving</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block" /> Idle (engine on)</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-blue-500  inline-block" /> Engine off</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-gray-400  inline-block" /> No recent ping</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-red-500   inline-block" /> Out of service</span>
      </div>
    </div>
  )
}
