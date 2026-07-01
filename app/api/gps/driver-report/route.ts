import { NextRequest, NextResponse } from 'next/server'
import { and, asc, eq, inArray, ne } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import { assets, wexTransactions } from '@/lib/db/schema'
import type { Company } from '@/lib/types'

const ONESTEP_API_KEY = process.env.ONESTEP_API_KEY
const KMH_TO_MPH = 0.621371
const SPEEDING_THRESHOLD_MPH = 75
const HARD_SPEEDING_MPH = 85

export interface VehicleDriverMetrics {
  vehicleName: string
  drivingPts: number
  idlePts: number
  topSpeedMph: number
  avgMovingSpeedMph: number
  speedEvents: number         // GPS points > 75 mph
  hardSpeedEvents: number     // GPS points > 85 mph
  idlePct: number
  // Dashcam events (Raven hevent_list)
  phoneEvents: number         // cellphone_detected
  tailgatingEvents: number    // tailgating
  fatigueEvents: number       // tired_detected + eating_detected
  bumpEvents: number          // possible_bump
  // WEX fuel
  trailingMpg: number | null
  historicalMpg: number | null
  mpgPctDiff: number | null
}

export interface DriverReport {
  driverName: string
  vehicles: VehicleDriverMetrics[]
  // Aggregated
  topSpeedMph: number
  speedEvents: number
  hardSpeedEvents: number
  phoneEvents: number
  tailgatingEvents: number
  fatigueEvents: number
  bumpEvents: number
  idlePct: number | null
  avgMpg: number | null
  mpgVsHistorical: number | null
  score: number               // 0–100 composite
}

function median(arr: number[]): number {
  if (!arr.length) return 0
  const s = [...arr].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 === 0 ? (s[m - 1] + s[m]) / 2 : s[m]
}

function computeScore(r: Omit<DriverReport, 'score'>): number {
  let score = 100

  // Phone use: most critical — each event -8 pts, max -40
  score -= Math.min(40, r.phoneEvents * 8)

  // Tailgating: -6 pts each, max -24
  score -= Math.min(24, r.tailgatingEvents * 6)

  // Hard speeding (>85 mph): -10 pts each, max -20
  score -= Math.min(20, r.hardSpeedEvents * 10)

  // Speeding (75-85 mph): -4 pts each, max -12
  const softSpeed = Math.max(0, r.speedEvents - r.hardSpeedEvents)
  score -= Math.min(12, softSpeed * 4)

  // Fatigue/distraction: -5 pts each, max -15
  score -= Math.min(15, r.fatigueEvents * 5)

  // Idle >25%: -0.5 per % over, max -10
  if (r.idlePct !== null) {
    score -= Math.min(10, Math.max(0, r.idlePct - 25) * 0.5)
  }

  // MPG: each % below historical -0.5 pts, max -10
  if (r.mpgVsHistorical !== null && r.mpgVsHistorical < 0) {
    score -= Math.min(10, Math.abs(r.mpgVsHistorical) * 0.5)
  }

  return Math.max(0, Math.round(score))
}

export async function GET(req: NextRequest) {
  const company = req.nextUrl.searchParams.get('company') as Company
  if (!company) return NextResponse.json({ error: 'company required' }, { status: 400 })

  const days = Math.min(Number(req.nextUrl.searchParams.get('days') ?? '7'), 30)
  const now = new Date()
  const periodStart = new Date(now.getTime() - days * 24 * 60 * 60 * 1000)
  const dtFrom = periodStart.toISOString()
  const dtTo = now.toISOString()

  const db = getDb()

  const vehicles = await db.select({
    id: assets.id,
    name: assets.name,
    assignedTo: assets.assignedTo,
    oneStepDeviceId: assets.oneStepDeviceId,
    fuelCardNumber: assets.fuelCardNumber,
  }).from(assets).where(
    and(
      eq(assets.company, company),
      eq(assets.type, 'vehicle'),
      ne(assets.status, 'retired'),
    )
  )

  const reportable = vehicles.filter(v => v.oneStepDeviceId || v.fuelCardNumber)
  const gpsVehicles = reportable.filter(v => v.oneStepDeviceId)

  // Fetch device-point history in parallel for all GPS vehicles
  const gpsResults = await Promise.allSettled(
    gpsVehicles.map(async v => {
      if (!ONESTEP_API_KEY) throw new Error('ONESTEP_API_KEY not set')
      const url = `https://track.onestepgps.com/v3/api/public/device-point?api-key=${ONESTEP_API_KEY}&device_id=${v.oneStepDeviceId}&limit=5000&dt_from=${dtFrom}&dt_to=${dtTo}`
      const res = await fetch(url, { cache: 'no-store' })
      if (!res.ok) throw new Error(`GPS ${res.status}`)
      const data = await res.json()
      const points: Record<string, unknown>[] = Array.isArray(data?.result_list) ? data.result_list : []
      return { vehicleId: v.id, points }
    })
  )

  type GpsMetrics = {
    drivingPts: number; idlePts: number
    topSpeedMph: number; avgMovingSpeedMph: number
    speedEvents: number; hardSpeedEvents: number; idlePct: number
    phoneEvents: number; tailgatingEvents: number; fatigueEvents: number; bumpEvents: number
  }
  const gpsMetrics = new Map<string, GpsMetrics>()

  for (let i = 0; i < gpsVehicles.length; i++) {
    const result = gpsResults[i]
    if (result.status === 'rejected') continue
    const { vehicleId, points } = result.value

    let drivingPts = 0, idlePts = 0, topSpeedMph = 0, totalMovingSpeed = 0
    let speedEvents = 0, hardSpeedEvents = 0
    let phoneEvents = 0, tailgatingEvents = 0, fatigueEvents = 0, bumpEvents = 0

    for (const pt of points) {
      const state = pt.device_state as Record<string, unknown> | undefined
      const detail = pt.device_point_detail as Record<string, unknown> | undefined
      const driveStatus = state?.drive_status as string | undefined
      const speedRaw = detail?.speed as { value?: number; unit?: string } | undefined
      const speedMph = speedRaw?.unit === 'km/h'
        ? (speedRaw?.value ?? 0) * KMH_TO_MPH
        : (speedRaw?.value ?? 0)

      if (driveStatus === 'driving') {
        drivingPts++
        if (speedMph > 2) {
          totalMovingSpeed += speedMph
          if (speedMph > topSpeedMph) topSpeedMph = speedMph
          if (speedMph > SPEEDING_THRESHOLD_MPH) speedEvents++
          if (speedMph > HARD_SPEEDING_MPH) hardSpeedEvents++
        }
      } else if (driveStatus === 'idle') {
        idlePts++
      }

      // Dashcam events from Raven hevent_list
      const heventList = detail?.hevent_list as Array<{ hevent_type?: string }> | null
      if (Array.isArray(heventList)) {
        for (const ev of heventList) {
          switch (ev?.hevent_type) {
            case 'cellphone_detected': phoneEvents++; break
            case 'tailgating':         tailgatingEvents++; break
            case 'tired_detected':
            case 'eating_detected':    fatigueEvents++; break
            case 'possible_bump':      bumpEvents++; break
          }
        }
      }
    }

    const activePoints = drivingPts + idlePts
    const idlePct = activePoints > 0 ? (idlePts / activePoints) * 100 : 0

    gpsMetrics.set(vehicleId, {
      drivingPts, idlePts,
      topSpeedMph:       Math.round(topSpeedMph * 10) / 10,
      avgMovingSpeedMph: drivingPts > 0 ? Math.round((totalMovingSpeed / drivingPts) * 10) / 10 : 0,
      speedEvents, hardSpeedEvents,
      idlePct: Math.round(idlePct * 10) / 10,
      phoneEvents, tailgatingEvents, fatigueEvents, bumpEvents,
    })
  }

  // ── WEX MPG ──────────────────────────────────────────────────────────────
  const wexVehicles = reportable.filter(v => v.fuelCardNumber)
  const cardNumbers  = wexVehicles.map(v => v.fuelCardNumber!)
  const byCard       = new Map(wexVehicles.map(v => [v.fuelCardNumber!, v.id]))

  const allTxns = cardNumbers.length > 0
    ? await db.select().from(wexTransactions)
        .where(inArray(wexTransactions.cardNumber, cardNumbers))
        .orderBy(asc(wexTransactions.date))
    : []

  const txnsByCard = new Map<string, typeof allTxns>()
  for (const t of allTxns) {
    const arr = txnsByCard.get(t.cardNumber) ?? []
    arr.push(t)
    txnsByCard.set(t.cardNumber, arr)
  }

  const mpgByVehicle = new Map<string, { trailing: number | null; historical: number | null; pctDiff: number | null }>()
  const SAMPLE = 5

  for (const [card, txns] of txnsByCard) {
    const vehicleId = byCard.get(card)
    if (!vehicleId) continue

    const series: { mpg: number }[] = []
    for (let i = 1; i < txns.length; i++) {
      const prev = txns[i - 1], curr = txns[i]
      if (!curr.odometer || !prev.odometer || !curr.gallons) continue
      const miles = curr.odometer - prev.odometer
      if (miles <= 0 || miles > 2000) continue
      const mpg = miles / curr.gallons
      if (mpg < 4 || mpg > 50) continue
      series.push({ mpg })
    }

    if (series.length < 2) { mpgByVehicle.set(vehicleId, { trailing: null, historical: null, pctDiff: null }); continue }

    const recent      = series.slice(Math.max(0, series.length - SAMPLE))
    const historical  = series.slice(0, Math.max(0, series.length - SAMPLE))
    const trailingMpg = Math.round(median(recent.map(p => p.mpg)) * 10) / 10
    const historicalMpg = historical.length > 0
      ? Math.round(median(historical.map(p => p.mpg)) * 10) / 10
      : null
    const pctDiff = historicalMpg
      ? Math.round(((trailingMpg - historicalMpg) / historicalMpg) * 100)
      : null

    mpgByVehicle.set(vehicleId, { trailing: trailingMpg, historical: historicalMpg, pctDiff })
  }

  // ── Build per-driver reports ──────────────────────────────────────────────
  const driverMap = new Map<string, { vehicles: VehicleDriverMetrics[] }>()

  for (const v of reportable) {
    const driverName = v.assignedTo ?? 'Unassigned'
    if (!driverMap.has(driverName)) driverMap.set(driverName, { vehicles: [] })

    const gps = gpsMetrics.get(v.id)
    const mpg = mpgByVehicle.get(v.id)

    driverMap.get(driverName)!.vehicles.push({
      vehicleName:       v.name,
      drivingPts:        gps?.drivingPts ?? 0,
      idlePts:           gps?.idlePts ?? 0,
      topSpeedMph:       gps?.topSpeedMph ?? 0,
      avgMovingSpeedMph: gps?.avgMovingSpeedMph ?? 0,
      speedEvents:       gps?.speedEvents ?? 0,
      hardSpeedEvents:   gps?.hardSpeedEvents ?? 0,
      idlePct:           gps?.idlePct ?? 0,
      phoneEvents:       gps?.phoneEvents ?? 0,
      tailgatingEvents:  gps?.tailgatingEvents ?? 0,
      fatigueEvents:     gps?.fatigueEvents ?? 0,
      bumpEvents:        gps?.bumpEvents ?? 0,
      trailingMpg:       mpg?.trailing ?? null,
      historicalMpg:     mpg?.historical ?? null,
      mpgPctDiff:        mpg?.pctDiff ?? null,
    })
  }

  const reports: DriverReport[] = []

  for (const [driverName, { vehicles: vms }] of driverMap) {
    const topSpeed = Math.max(0, ...vms.map(v => v.topSpeedMph))

    const totalActive = vms.reduce((s, v) => s + v.drivingPts + v.idlePts, 0)
    const totalIdle   = vms.reduce((s, v) => s + v.idlePts, 0)
    const idlePct     = totalActive > 0 ? Math.round((totalIdle / totalActive) * 1000) / 10 : null

    const mpgPoints  = vms.filter(v => v.trailingMpg !== null)
    const avgMpg     = mpgPoints.length > 0
      ? Math.round(mpgPoints.reduce((s, v) => s + v.trailingMpg!, 0) / mpgPoints.length * 10) / 10
      : null

    const histPoints = vms.filter(v => v.historicalMpg !== null)
    const avgHistMpg = histPoints.length > 0
      ? histPoints.reduce((s, v) => s + v.historicalMpg!, 0) / histPoints.length
      : null

    const mpgVsHistorical = avgMpg !== null && avgHistMpg !== null
      ? Math.round(((avgMpg - avgHistMpg) / avgHistMpg) * 100)
      : null

    const partial: Omit<DriverReport, 'score'> = {
      driverName, vehicles: vms,
      topSpeedMph:       Math.round(topSpeed * 10) / 10,
      speedEvents:       vms.reduce((s, v) => s + v.speedEvents, 0),
      hardSpeedEvents:   vms.reduce((s, v) => s + v.hardSpeedEvents, 0),
      phoneEvents:       vms.reduce((s, v) => s + v.phoneEvents, 0),
      tailgatingEvents:  vms.reduce((s, v) => s + v.tailgatingEvents, 0),
      fatigueEvents:     vms.reduce((s, v) => s + v.fatigueEvents, 0),
      bumpEvents:        vms.reduce((s, v) => s + v.bumpEvents, 0),
      idlePct, avgMpg, mpgVsHistorical,
    }

    reports.push({ ...partial, score: computeScore(partial) })
  }

  reports.sort((a, b) => {
    if (a.driverName === 'Unassigned') return 1
    if (b.driverName === 'Unassigned') return -1
    return b.score - a.score
  })

  return NextResponse.json({
    period: { start: periodStart.toISOString(), end: now.toISOString(), days },
    reports,
  })
}
