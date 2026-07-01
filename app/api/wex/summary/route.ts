import { NextRequest, NextResponse } from 'next/server'
import { and, asc, eq, inArray, isNotNull } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import { assets, driveStops, wexTransactions } from '@/lib/db/schema'

export interface FuelSummary {
  period: { start: string; end: string; days: number }
  totals: {
    spend: number
    gallons: number
    transactions: number
    avgCostPerGallon: number
    vehicles: number
  }
  alerts: {
    nonUnleaded: NonUnleadedAlert[]
    mpgAnomalies: MpgAlert[]
    odometerDiscrepancies: OdoAlert[]
  }
}

export interface NonUnleadedAlert {
  vehicleName: string; assetId: string; date: string
  productType: string; merchantName: string; totalAmount: number
}

export interface MpgAlert {
  vehicleName: string; assetId: string; date: string
  actualMpg: number; avgMpg: number; pctDiff: number
  gallons: number; merchantName: string; direction: 'low' | 'high'
}

export interface OdoAlert {
  vehicleName: string; assetId: string; date: string
  wexOdometer: number; gpsOdometer: number; difference: number
  merchantName: string
}

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

export async function GET(req: NextRequest) {
  const company = req.nextUrl.searchParams.get('company')
  if (!company) return NextResponse.json({ error: 'company required' }, { status: 400 })

  const days = Math.min(Number(req.nextUrl.searchParams.get('days') ?? '30'), 365)
  const now = new Date()
  const periodStart = new Date(now.getTime() - days * 24 * 60 * 60 * 1000)

  const db = getDb()

  // Load vehicles for this company that have a fuel card
  const vehicles = await db.select({
    id: assets.id,
    name: assets.name,
    fuelCardNumber: assets.fuelCardNumber,
    oneStepDeviceId: assets.oneStepDeviceId,
  }).from(assets).where(and(eq(assets.company, company), isNotNull(assets.fuelCardNumber)))

  const empty: FuelSummary = {
    period: { start: periodStart.toISOString(), end: now.toISOString(), days },
    totals: { spend: 0, gallons: 0, transactions: 0, avgCostPerGallon: 0, vehicles: 0 },
    alerts: { nonUnleaded: [], mpgAnomalies: [], odometerDiscrepancies: [] },
  }
  if (vehicles.length === 0) return NextResponse.json(empty)

  const cardNumbers  = vehicles.map(v => v.fuelCardNumber!)
  const byCard       = new Map(vehicles.map(v => [v.fuelCardNumber!, v]))

  // All transactions (need full history for MPG median)
  const allTxns = await db.select().from(wexTransactions)
    .where(inArray(wexTransactions.cardNumber, cardNumbers))
    .orderBy(asc(wexTransactions.date))

  // Drive stops for GPS odometer cross-check
  const deviceIds = vehicles.filter(v => v.oneStepDeviceId).map(v => v.oneStepDeviceId!)
  const byDevice  = new Map(vehicles.filter(v => v.oneStepDeviceId).map(v => [v.oneStepDeviceId!, v]))
  const stops = deviceIds.length > 0
    ? await db.select({
        deviceId:      driveStops.deviceId,
        timeFrom:      driveStops.timeFrom,
        timeTo:        driveStops.timeTo,
        odometerFromMi: driveStops.odometerFromMi,
        odometerToMi:   driveStops.odometerToMi,
      }).from(driveStops).where(inArray(driveStops.deviceId, deviceIds))
    : []

  // Group stops by deviceId
  const stopsByDevice = new Map<string, typeof stops>()
  for (const s of stops) {
    const arr = stopsByDevice.get(s.deviceId) ?? []
    arr.push(s)
    stopsByDevice.set(s.deviceId, arr)
  }

  // Period filter
  const periodTxns = allTxns.filter(t => new Date(t.date) >= periodStart)

  // ── Totals ──────────────────────────────────────────────────────────────────
  const totalSpend   = periodTxns.reduce((s, t) => s + t.totalAmount, 0)
  const totalGallons = periodTxns.reduce((s, t) => s + (t.gallons ?? 0), 0)

  // ── Alert: non-unleaded ──────────────────────────────────────────────────────
  const nonUnleaded: NonUnleadedAlert[] = periodTxns
    .filter(t => t.productType && !t.productType.toLowerCase().includes('unleaded'))
    .map(t => ({
      vehicleName: byCard.get(t.cardNumber)?.name ?? t.cardNumber,
      assetId:     byCard.get(t.cardNumber)?.id   ?? '',
      date:        t.date,
      productType: t.productType!,
      merchantName: [t.merchantName, t.merchantCity, t.merchantState].filter(Boolean).join(', '),
      totalAmount: t.totalAmount,
    }))
    .sort((a, b) => b.date.localeCompare(a.date))

  // ── Alert: MPG anomalies ─────────────────────────────────────────────────────
  // Group all-time txns by card → compute MPG series → find period outliers
  const txnsByCard = new Map<string, typeof allTxns>()
  for (const t of allTxns) {
    const arr = txnsByCard.get(t.cardNumber) ?? []
    arr.push(t)
    txnsByCard.set(t.cardNumber, arr)
  }

  const mpgAnomalies: MpgAlert[] = []
  for (const [card, txns] of txnsByCard) {
    const v = byCard.get(card)
    if (!v) continue

    // Build MPG series from consecutive odometer pairs
    type MpgPoint = { date: string; mpg: number; gallons: number; merchantName: string }
    const series: MpgPoint[] = []
    for (let i = 1; i < txns.length; i++) {
      const prev = txns[i - 1], curr = txns[i]
      if (!curr.odometer || !prev.odometer || !curr.gallons) continue
      const miles = curr.odometer - prev.odometer
      if (miles <= 0 || miles > 2000) continue   // skip bad odometer entries
      const mpg = miles / curr.gallons
      if (mpg < 4 || mpg > 50) continue          // skip physically impossible values
      series.push({ date: curr.date, mpg, gallons: curr.gallons, merchantName: curr.merchantName ?? '' })
    }

    // Rolling 5-point window: each fill-up is compared against the median of
    // the 5 preceding fill-ups so the baseline stays local and recent.
    const WINDOW = 5
    for (let i = WINDOW; i < series.length; i++) {
      if (new Date(series[i].date) < periodStart) continue
      const window = series.slice(i - WINDOW, i).map(p => p.mpg)
      const avgMpg = median(window)
      const pt = series[i]
      const pct = ((pt.mpg - avgMpg) / avgMpg) * 100
      if (Math.abs(pct) > 15) {
        mpgAnomalies.push({
          vehicleName: v.name,
          assetId:     v.id,
          date:        pt.date,
          actualMpg:   Math.round(pt.mpg * 10) / 10,
          avgMpg:      Math.round(avgMpg * 10) / 10,
          pctDiff:     Math.round(pct),
          gallons:     pt.gallons,
          merchantName: pt.merchantName,
          direction:   pct < 0 ? 'low' : 'high',
        })
      }
    }
  }
  mpgAnomalies.sort((a, b) => b.date.localeCompare(a.date))

  // ── Alert: GPS odometer discrepancies ────────────────────────────────────────
  const odometerDiscrepancies: OdoAlert[] = []
  for (const txn of periodTxns) {
    if (!txn.odometer || txn.odometer < 100) continue
    const v = byCard.get(txn.cardNumber)
    if (!v?.oneStepDeviceId) continue
    const deviceStops = stopsByDevice.get(v.oneStepDeviceId) ?? []
    if (deviceStops.length === 0) continue

    const txnMs = new Date(txn.date).getTime()
    let best: typeof deviceStops[0] | null = null
    let bestDiff = Infinity
    for (const s of deviceStops) {
      // Use the stop that ended closest in time to the fill-up (within 4 hours)
      const stopMs = new Date(s.timeTo ?? s.timeFrom).getTime()
      const diff = Math.abs(txnMs - stopMs)
      if (diff < bestDiff && diff < 4 * 3_600_000) { bestDiff = diff; best = s }
    }
    if (!best) continue

    const gpsOdo = best.odometerToMi ?? best.odometerFromMi
    if (!gpsOdo || gpsOdo < 500) continue  // skip near-zero GPS odo (uncalibrated)

    const diff = Math.abs(txn.odometer - gpsOdo)
    // Flag if more than 200 miles OR more than 3% off, whichever is larger
    const threshold = Math.max(200, gpsOdo * 0.03)
    if (diff > threshold) {
      odometerDiscrepancies.push({
        vehicleName: v.name,
        assetId:     v.id,
        date:        txn.date,
        wexOdometer: Math.round(txn.odometer),
        gpsOdometer: Math.round(gpsOdo),
        difference:  Math.round(diff),
        merchantName: [txn.merchantName, txn.merchantCity, txn.merchantState].filter(Boolean).join(', '),
      })
    }
  }
  odometerDiscrepancies.sort((a, b) => b.date.localeCompare(a.date))

  const result: FuelSummary = {
    period: { start: periodStart.toISOString(), end: now.toISOString(), days },
    totals: {
      spend:             Math.round(totalSpend * 100) / 100,
      gallons:           Math.round(totalGallons * 10) / 10,
      transactions:      periodTxns.length,
      avgCostPerGallon:  totalGallons > 0 ? Math.round((totalSpend / totalGallons) * 1000) / 1000 : 0,
      vehicles:          new Set(periodTxns.map(t => t.cardNumber)).size,
    },
    alerts: { nonUnleaded, mpgAnomalies, odometerDiscrepancies },
  }

  return NextResponse.json(result)
}
