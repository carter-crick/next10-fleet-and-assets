import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs/promises'
import path from 'path'
import type { DriveStop, GpsLocation } from '@/lib/types'

const GPS_FILE     = path.join(process.cwd(), 'data', 'gps-locations.json')
const TRIPS_FILE   = path.join(process.cwd(), 'data', 'drive-stops.json')
const BC_FILE      = path.join(process.cwd(), 'data', 'balanced-comfort.json')
const SAILORS_FILE = path.join(process.cwd(), 'data', 'sailors-air.json')

async function readLocations(): Promise<Record<string, GpsLocation>> {
  try { return JSON.parse(await fs.readFile(GPS_FILE, 'utf-8')) } catch { return {} }
}
async function writeLocations(data: Record<string, GpsLocation>) {
  await fs.writeFile(GPS_FILE, JSON.stringify(data, null, 2), 'utf-8')
}
async function readTrips(): Promise<Record<string, DriveStop[]>> {
  try { return JSON.parse(await fs.readFile(TRIPS_FILE, 'utf-8')) } catch { return {} }
}
async function writeTrips(data: Record<string, DriveStop[]>) {
  await fs.writeFile(TRIPS_FILE, JSON.stringify(data, null, 2), 'utf-8')
}

// When a ping includes an odometer reading, update the matched vehicle's
// mileage field in the company data so it stays current automatically.
async function syncOdometerToVehicle(deviceId: string, odometer: number) {
  for (const file of [BC_FILE, SAILORS_FILE]) {
    try {
      const data = JSON.parse(await fs.readFile(file, 'utf-8'))
      const asset = data.assets?.find(
        (a: { type: string; oneStepDeviceId?: string; mileage?: number }) =>
          a.type === 'vehicle' && a.oneStepDeviceId === deviceId
      )
      if (asset) {
        // Only update if the new reading is higher (odometers don't go backwards)
        if (!asset.mileage || odometer > asset.mileage) {
          asset.mileage = Math.round(odometer)
          asset.updatedAt = new Date().toISOString()
          await fs.writeFile(file, JSON.stringify(data, null, 2), 'utf-8')
        }
        return
      }
    } catch { /* file may not exist */ }
  }
}

function parsePayload(body: Record<string, unknown>): GpsLocation | null {
  // DataQueue envelope: { schema: "device_point", value: {...} }
  const point: Record<string, unknown> =
    body.schema === 'device_point' && body.value
      ? (body.value as Record<string, unknown>)
      : body

  const deviceId = String(point.device_id ?? point.serial ?? point.id ?? '')
  if (!deviceId) return null

  const lat = Number(point.lat ?? point.latitude)
  const lng = Number(point.lng ?? point.longitude)
  if (isNaN(lat) || isNaN(lng) || (lat === 0 && lng === 0)) return null

  const detail   = (point.device_point_detail ?? {}) as Record<string, unknown>
  const speedObj = (detail.speed ?? {})               as Record<string, unknown>
  const rawSpeedKmh = speedObj.value != null ? Number(speedObj.value)
    : point.speed  != null ? Number(point.speed) : undefined
  const speedMph = rawSpeedKmh != null ? Math.round(rawSpeedKmh * 0.621371 * 10) / 10 : undefined

  const heading = point.angle != null ? Number(point.angle)
    : detail.heading != null ? Number(detail.heading) : undefined

  const state  = (point.device_state ?? {})              as Record<string, unknown>
  const hwOdo  = (state.hardware_odometer ?? {})          as Record<string, unknown>
  const hwUnit = String(hwOdo.unit ?? 'km').toLowerCase()
  const hwVal  = hwOdo.value != null ? Number(hwOdo.value) : undefined
  // Fall back to device_state.odometer (computed best) when hardware_odometer is absent
  const bestOdo    = (state.odometer ?? state.software_odometer ?? {}) as Record<string, unknown>
  const bestOdoVal = bestOdo.value != null ? Number(bestOdo.value) : undefined
  const odometerMi = hwVal != null
    ? (hwUnit === 'mi' ? Math.round(hwVal) : Math.round(hwVal * 0.621371))
    : bestOdoVal != null
      ? Math.round(bestOdoVal * 0.621371)
      : undefined

  // Engine hours from counter_list key "eh"
  const counterList = Array.isArray(state.counter_list)
    ? (state.counter_list as Array<{ key: string; val: number }>)
    : []
  const ehEntry    = counterList.find(c => c.key === 'eh')
  const engineHours = ehEntry ? Math.round(ehEntry.val * 10) / 10 : undefined

  const driveStatus = String(state.drive_status ?? '') || undefined
  const fuelPercent = state.fuel_percent != null ? Number(state.fuel_percent)
    : detail.fuel_percent != null ? Number(detail.fuel_percent) : undefined

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

function parseDriveStop(body: Record<string, unknown>): DriveStop | null {
  const value: Record<string, unknown> =
    body.schema === 'drive_stop' && body.value
      ? (body.value as Record<string, unknown>)
      : body

  const deviceId = String(value.device_id ?? '')
  if (!deviceId) return null

  const ds = (value.drive_stop ?? {}) as Record<string, unknown>
  const type = String(ds.type ?? '')
  if (type !== 'drive' && type !== 'stop') return null

  const timeFrom = String(ds.time_from ?? '')
  const timeTo   = String(ds.time_to   ?? '')
  if (!timeFrom) return null

  const id = String(ds.device_point_id_from ?? `${deviceId}-${timeFrom}`)

  const durObj   = (ds.duration     ?? {}) as Record<string, unknown>
  const distObj  = (ds.distance     ?? {}) as Record<string, unknown>
  const odoFrObj = (ds.odometer_from ?? {}) as Record<string, unknown>
  const odoToObj = (ds.odometer_to   ?? {}) as Record<string, unknown>
  const avgObj   = (ds.average_speed ?? {}) as Record<string, unknown>
  const topObj   = (ds.top_speed    ?? {}) as Record<string, unknown>
  const idleObj  = (ds.idle_duration ?? {}) as Record<string, unknown>
  const llFrom   = (ds.lat_lng_from  ?? {}) as Record<string, unknown>
  const llTo     = (ds.lat_lng_to    ?? {}) as Record<string, unknown>

  const durationSec = durObj.value  != null ? Number(durObj.value)  : 0
  const distM       = distObj.value != null ? Number(distObj.value) : undefined
  const distanceMi  = distM != null ? Math.round(distM / 1609.344 * 100) / 100 : undefined

  const odoFrKm      = odoFrObj.value != null ? Number(odoFrObj.value) : undefined
  const odoToKm      = odoToObj.value != null ? Number(odoToObj.value) : undefined
  const odometerFromMi = odoFrKm != null ? Math.round(odoFrKm * 0.621371) : undefined
  const odometerToMi   = odoToKm != null ? Math.round(odoToKm * 0.621371) : undefined

  // average_speed.value is m/s; top_speed.value is km/h
  const avgSpeedMs  = avgObj.value != null ? Number(avgObj.value) : undefined
  const topSpeedKmh = topObj.value != null ? Number(topObj.value) : undefined
  const avgSpeedMph = avgSpeedMs  != null ? Math.round(avgSpeedMs  * 2.237 * 10) / 10 : undefined
  const topSpeedMph = topSpeedKmh != null ? Math.round(topSpeedKmh * 0.621371 * 10) / 10 : undefined

  const idleDurationSec = idleObj.value != null ? Number(idleObj.value) : undefined

  // Zones: prefer from drive_stop object, fall back to top-level value
  const zfList = Array.isArray(ds.zone_from_list)    ? ds.zone_from_list as Array<{name:string}>
    : Array.isArray(value.zone_from_list) ? value.zone_from_list as Array<{name:string}> : []
  const ztList = Array.isArray(ds.zone_to_list)      ? ds.zone_to_list   as Array<{name:string}>
    : Array.isArray(value.zone_to_list)   ? value.zone_to_list   as Array<{name:string}> : []
  const zoneFrom = zfList[0]?.name
  const zoneTo   = ztList[0]?.name

  const events      = ds.hevent_count_map as Record<string, number> | undefined
  const isIncomplete = Boolean(ds.is_incomplete)

  return {
    id, deviceId, type: type as 'drive' | 'stop',
    timeFrom, timeTo, durationSec,
    ...(distanceMi    != null && { distanceMi }),
    ...(odometerFromMi != null && { odometerFromMi }),
    ...(odometerToMi  != null && { odometerToMi }),
    ...(avgSpeedMph   != null && { avgSpeedMph }),
    ...(topSpeedMph   != null && { topSpeedMph }),
    ...(idleDurationSec != null && { idleDurationSec }),
    ...(llFrom.lat != null && { latFrom: Number(llFrom.lat) }),
    ...(llFrom.lng != null && { lngFrom: Number(llFrom.lng) }),
    ...(llTo.lat   != null && { latTo:   Number(llTo.lat) }),
    ...(llTo.lng   != null && { lngTo:   Number(llTo.lng) }),
    ...(zoneFrom && { zoneFrom }),
    ...(zoneTo   && { zoneTo }),
    ...(events && Object.keys(events).length > 0 && { events }),
    isIncomplete,
    receivedAt: new Date().toISOString(),
  }
}

export async function POST(req: NextRequest) {
  const secret = process.env.ONESTEP_WEBHOOK_SECRET
  if (secret) {
    const provided = req.nextUrl.searchParams.get('secret') ?? req.headers.get('x-webhook-secret') ?? ''
    if (provided !== secret) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const events = Array.isArray(body) ? body as Record<string, unknown>[] : [body]
  const locations = await readLocations()
  const trips     = await readTrips()
  let locUpdated   = 0
  let tripsUpdated = 0

  for (const event of events) {
    if (event.schema === 'drive_stop') {
      const trip = parseDriveStop(event)
      if (!trip) continue
      const bucket = trips[trip.deviceId] ?? []
      if (!bucket.some(t => t.id === trip.id)) {
        trips[trip.deviceId] = [trip, ...bucket].slice(0, 50)
        tripsUpdated++
      }
    } else {
      const loc = parsePayload(event)
      if (!loc) continue
      const existing = locations[loc.deviceId]
      if (!existing || loc.timestamp >= existing.timestamp) {
        locations[loc.deviceId] = loc
        locUpdated++
        if (loc.odometer) await syncOdometerToVehicle(loc.deviceId, loc.odometer)
      }
    }
  }

  if (locUpdated   > 0) await writeLocations(locations)
  if (tripsUpdated > 0) await writeTrips(trips)
  return NextResponse.json({ received: events.length, locUpdated, tripsUpdated })
}
