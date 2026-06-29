import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs/promises'
import path from 'path'
import type { GpsLocation } from '@/lib/types'

const GPS_FILE     = path.join(process.cwd(), 'data', 'gps-locations.json')
const BC_FILE      = path.join(process.cwd(), 'data', 'balanced-comfort.json')
const SAILORS_FILE = path.join(process.cwd(), 'data', 'sailors-air.json')

async function readCache(): Promise<Record<string, GpsLocation>> {
  try { return JSON.parse(await fs.readFile(GPS_FILE, 'utf-8')) } catch { return {} }
}
async function writeCache(data: Record<string, GpsLocation>) {
  await fs.writeFile(GPS_FILE, JSON.stringify(data, null, 2), 'utf-8')
}

async function syncOdometerToVehicle(deviceId: string, odometer: number) {
  for (const file of [BC_FILE, SAILORS_FILE]) {
    try {
      const data = JSON.parse(await fs.readFile(file, 'utf-8'))
      const asset = data.assets?.find(
        (a: { type: string; oneStepDeviceId?: string; mileage?: number }) =>
          a.type === 'vehicle' && a.oneStepDeviceId === deviceId
      )
      if (asset && (!asset.mileage || odometer > asset.mileage)) {
        asset.mileage   = odometer
        asset.updatedAt = new Date().toISOString()
        await fs.writeFile(file, JSON.stringify(data, null, 2), 'utf-8')
        return
      }
    } catch { /* file may not exist */ }
  }
}

function parseDevicePoint(points: Record<string, unknown>[], deviceId: string): GpsLocation | null {
  const point = points[0]
  if (!point) return null

  const lat = Number(point.lat)
  const lng = Number(point.lng)
  if (isNaN(lat) || isNaN(lng) || (lat === 0 && lng === 0)) return null

  const detail   = (point.device_point_detail ?? {}) as Record<string, unknown>
  const speedObj = (detail.speed ?? {})              as Record<string, unknown>
  // detail.speed.value in km/h; fall back to top-level point.speed (also km/h)
  const rawSpeedKmh = speedObj.value != null ? Number(speedObj.value)
    : point.speed != null ? Number(point.speed) : undefined
  const speedMph = rawSpeedKmh != null ? Math.round(rawSpeedKmh * 0.621371 * 10) / 10 : undefined

  const heading = point.angle != null ? Number(point.angle) : undefined

  const state  = (point.device_state ?? {})             as Record<string, unknown>
  const hwOdo  = (state.hardware_odometer ?? {})         as Record<string, unknown>
  const hwUnit = String(hwOdo.unit ?? 'km').toLowerCase()
  const hwVal  = hwOdo.value != null ? Number(hwOdo.value) : undefined
  const bestOdo    = (state.odometer ?? state.software_odometer ?? {}) as Record<string, unknown>
  const bestOdoVal = bestOdo.value != null ? Number(bestOdo.value) : undefined
  const odometerMi = hwVal != null
    ? (hwUnit === 'mi' ? Math.round(hwVal) : Math.round(hwVal * 0.621371))
    : bestOdoVal != null
      ? Math.round(bestOdoVal * 0.621371)
      : undefined

  const counterList = Array.isArray(state.counter_list)
    ? (state.counter_list as Array<{ key: string; val: number }>)
    : []
  const ehEntry    = counterList.find(c => c.key === 'eh')
  const engineHours = ehEntry ? Math.round(ehEntry.val * 10) / 10 : undefined

  const driveStatus = String(state.drive_status  ?? '') || undefined
  const fuelPercent = state.fuel_percent != null ? Number(state.fuel_percent)
    : (point.device_point_detail as Record<string,unknown> | undefined)?.fuel_percent != null
      ? Number((point.device_point_detail as Record<string,unknown>).fuel_percent)
      : undefined

  const timestamp = String(point.dt_tracker ?? point.dt_server ?? new Date().toISOString())

  return {
    deviceId, lat, lng,
    ...(speedMph    != null && { speed: speedMph }),
    ...(heading     != null && !isNaN(heading)     && { heading }),
    ...(odometerMi  != null && { odometer: odometerMi }),
    ...(engineHours != null && { engineHours }),
    ...(driveStatus != null && { driveStatus }),
    ...(fuelPercent != null && !isNaN(fuelPercent) && { fuelPercent }),
    timestamp,
    receivedAt: new Date().toISOString(),
  }
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ deviceId: string }> }) {
  const { deviceId } = await params
  const apiKey = process.env.ONESTEP_API_KEY

  if (apiKey) {
    try {
      const res = await fetch(
        `https://track.onestepgps.com/v3/api/public/device-point?api-key=${apiKey}&device_id=${deviceId}&limit=1`,
        { next: { revalidate: 0 } }
      )
      if (res.ok) {
        const points: Record<string, unknown>[] = await res.json()
        const loc = parseDevicePoint(Array.isArray(points) ? points : [points], deviceId)
        if (loc) {
          const cache = await readCache()
          cache[deviceId] = loc
          await writeCache(cache).catch(() => {})
          if (loc.odometer) await syncOdometerToVehicle(deviceId, loc.odometer)
          return NextResponse.json(loc)
        }
      }
    } catch { /* fall through to cache */ }
  }

  try {
    const cache = await readCache()
    const loc = cache[deviceId]
    if (loc) return NextResponse.json(loc)
  } catch { /* ignore */ }

  return NextResponse.json({ error: 'No location data available' }, { status: 404 })
}
