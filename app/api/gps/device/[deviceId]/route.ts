import { NextRequest, NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import { assets, gpsLocations } from '@/lib/db/schema'
import type { GpsLocation } from '@/lib/types'

async function syncOdometerToVehicle(deviceId: string, odometer: number) {
  const db = getDb()
  const [asset] = await db.select({ id: assets.id, mileage: assets.mileage })
    .from(assets).where(eq(assets.oneStepDeviceId, deviceId)).limit(1)
  if (asset && (!asset.mileage || odometer > asset.mileage)) {
    await db.update(assets)
      .set({ mileage: odometer, updatedAt: new Date().toISOString() })
      .where(eq(assets.id, asset.id))
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
    : bestOdoVal != null ? Math.round(bestOdoVal * 0.621371) : undefined

  const counterList = Array.isArray(state.counter_list)
    ? (state.counter_list as Array<{ key: string; val: number }>)
    : []
  const ehEntry    = counterList.find(c => c.key === 'eh')
  const engineHours = ehEntry ? Math.round(ehEntry.val * 10) / 10 : undefined

  const driveStatus = String(state.drive_status ?? '') || undefined
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
  const db = getDb()

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
          })
          if (loc.odometer) await syncOdometerToVehicle(deviceId, loc.odometer)
          return NextResponse.json(loc)
        }
      }
    } catch { /* fall through to DB cache */ }
  }

  const [cached] = await db.select().from(gpsLocations).where(eq(gpsLocations.deviceId, deviceId)).limit(1)
  if (cached) return NextResponse.json(cached)

  return NextResponse.json({ error: 'No location data available' }, { status: 404 })
}
