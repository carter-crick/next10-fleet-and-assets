import { NextRequest, NextResponse } from 'next/server'
import { eq, isNotNull, inArray } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import { assets as assetsTable, gpsLocations } from '@/lib/db/schema'
import type { Asset, Company, GpsLocation } from '@/lib/types'

export interface FleetVehicle {
  id: string
  name: string
  assignedTo?: string
  status: string
  deviceId: string
  lat: number
  lng: number
  speed?: number        // mph
  heading?: number
  address?: string
  odometer?: number     // miles
  driveStatus?: string  // 'moving' | 'idle' | 'off'
  fuelPercent?: number
  timestamp: string
  receivedAt: string
}

// OneStep /device-point response uses different field names than /device
// Speed is in km/h, odometer in km — both converted to imperial here
function parseDevicePoint(
  points: Record<string, unknown>[],
  deviceId: string
): GpsLocation | null {
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

  const driveStatus  = String(state.drive_status  ?? '')    || undefined
  const fuelPercent  = state.fuel_percent != null ? Number(state.fuel_percent)
    : (point.device_point_detail as Record<string,unknown> | undefined)?.fuel_percent != null
      ? Number((point.device_point_detail as Record<string,unknown>).fuel_percent)
      : undefined

  const timestamp = String(point.dt_tracker ?? point.dt_server ?? new Date().toISOString())

  return {
    deviceId,
    lat, lng,
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

export async function GET(req: NextRequest) {
  const company = req.nextUrl.searchParams.get('company') as Company
  if (!company) return NextResponse.json({ error: 'company required' }, { status: 400 })

  const apiKey = process.env.ONESTEP_API_KEY
  const db = getDb()

  const rows = await db.select().from(assetsTable)
    .where(eq(assetsTable.company, company))
  const assets = (rows as Asset[]).filter(a => a.type === 'vehicle' && a.oneStepDeviceId)

  const livePoints = new Map<string, GpsLocation>()

  if (apiKey) {
    // Fire all device-point requests in parallel — one call per tracked vehicle
    const settled = await Promise.allSettled(
      assets.map(async (asset) => {
        const res = await fetch(
          `https://track.onestepgps.com/v3/api/public/device-point?api-key=${apiKey}&device_id=${asset.oneStepDeviceId}&limit=1`,
          { next: { revalidate: 0 } }
        )
        if (!res.ok) return
        const points: Record<string, unknown>[] = await res.json()
        const loc = parseDevicePoint(Array.isArray(points) ? points : [points], asset.oneStepDeviceId!)
        if (loc) {
          livePoints.set(asset.oneStepDeviceId!, loc)
          await db.insert(gpsLocations).values(loc).onConflictDoUpdate({
            target: gpsLocations.deviceId,
            set: {
              lat: loc.lat, lng: loc.lng,
              speed:       loc.speed       ?? null,
              heading:     loc.heading     ?? null,
              address:     loc.address     ?? null,
              odometer:    loc.odometer    ?? null,
              engineHours: loc.engineHours ?? null,
              driveStatus: loc.driveStatus ?? null,
              fuelPercent: loc.fuelPercent ?? null,
              timestamp:   loc.timestamp,
              receivedAt:  loc.receivedAt,
            },
          }).catch(() => {})
        }
      })
    )
    void settled
  }

  // Fill any gaps from DB cache
  const deviceIds = assets.map(a => a.oneStepDeviceId!)
  if (deviceIds.length > 0) {
    const cached = await db.select().from(gpsLocations).where(inArray(gpsLocations.deviceId, deviceIds))
    for (const row of cached) {
      if (!livePoints.has(row.deviceId)) livePoints.set(row.deviceId, row as GpsLocation)
    }
  }

  const result: FleetVehicle[] = []
  for (const asset of assets) {
    const did = asset.oneStepDeviceId!
    const loc = livePoints.get(did)
    if (!loc) continue
    result.push({
      id:           asset.id,
      name:         asset.name,
      assignedTo:   asset.assignedTo,
      status:       asset.status,
      deviceId:     did,
      lat:          loc.lat,
      lng:          loc.lng,
      speed:        loc.speed,
      heading:      loc.heading,
      address:      loc.address,
      odometer:     loc.odometer,
      driveStatus:  loc.driveStatus,
      fuelPercent:  loc.fuelPercent,
      timestamp:    loc.timestamp,
      receivedAt:   loc.receivedAt,
    })
  }

  return NextResponse.json(result)
}
