import { NextRequest, NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import { assets, wexTransactions } from '@/lib/db/schema'
import type { WexTransaction } from '@/lib/types'

function parseCSV(text: string): string[][] {
  const rows: string[][] = []
  const lines = text.split(/\r?\n/)
  for (const line of lines) {
    if (!line.trim()) continue
    const fields: string[] = []
    let i = 0
    while (i < line.length) {
      if (line[i] === '"') {
        let j = i + 1
        while (j < line.length) {
          if (line[j] === '"' && line[j + 1] === '"') j += 2
          else if (line[j] === '"') { j++; break }
          else j++
        }
        fields.push(line.slice(i + 1, j - 1).replace(/""/g, '"'))
        i = j
        if (line[i] === ',') i++
      } else {
        const end = line.indexOf(',', i)
        if (end === -1) { fields.push(line.slice(i).trim()); break }
        fields.push(line.slice(i, end).trim())
        i = end + 1
      }
    }
    rows.push(fields)
  }
  return rows
}

function norm(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '')
}

// Column aliases covering WEX EFM's exact export headers + common variants
const COL_ALIASES: Record<string, string[]> = {
  date:            ['transactiondate', 'transdate', 'date', 'txndate', 'postdate', 'postingdate', 'trandate'],
  time:            ['transactiontime', 'time', 'txntime', 'trantime'],
  cardNumber:      ['cardnumber', 'cardno', 'cardnbr', 'card', 'cardnum', 'cardlast4', 'cardaccount'],
  id:              ['transid', 'transactionid', 'txnid', 'txnnbr', 'transactionno', 'transno', 'referencenumber', 'refno', 'confirmationno'],
  vin:             ['vin', 'vehiclevin', 'vehicleidentificationnumber'],
  customVehicleId: ['customvehicleassetid', 'customvehicleid', 'vehicleassetid'],
  merchantName:    ['merchantname', 'merchant', 'station', 'vendor', 'locationname', 'stationname'],
  merchantCity:    ['merchantcity', 'city', 'merchcity', 'stationcity'],
  merchantState:   ['merchantstateprovince', 'merchantstate', 'state', 'merchstate', 'stateabbr', 'st'],
  productType:     ['productdescription', 'product', 'productdesc', 'producttype', 'fueltype', 'description'],
  gallons:         ['units', 'gallons', 'quantity', 'qty', 'volume', 'unitquantity', 'totalfuelunits'],
  pricePerGallon:  ['unitcost', 'unitprice', 'pricepergallon', 'pricegal', 'perprice'],
  totalAmount:     ['netcost', 'total', 'totalamount', 'grosscost', 'amount', 'nettotal', 'grosstotal', 'invoiceamount', 'totalfuelcost'],
  odometer:        ['currentodometer', 'odometer', 'odo', 'odometerreading', 'adjustedodometer', 'mileage'],
}

function buildColMap(headers: string[]): Record<string, number> {
  const map: Record<string, number> = {}
  headers.forEach((h, i) => {
    const n = norm(h)
    for (const [field, aliases] of Object.entries(COL_ALIASES)) {
      if (!(field in map) && aliases.includes(n)) map[field] = i
    }
  })
  return map
}

function col(row: string[], colMap: Record<string, number>, field: string): string {
  const idx = colMap[field]
  return idx != null ? (row[idx] ?? '').trim() : ''
}

function parseDateTime(dateStr: string, timeStr: string): string {
  if (!dateStr) return new Date().toISOString()
  // Try combining date + time first (e.g. "06/29/2026" + "20:05:00")
  if (timeStr) {
    const combined = new Date(`${dateStr} ${timeStr}`)
    if (!isNaN(combined.getTime())) return combined.toISOString()
  }
  const d = new Date(dateStr)
  if (!isNaN(d.getTime())) return d.toISOString()
  // Try MM/DD/YYYY
  const m = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (m) {
    const iso = new Date(`${m[3]}-${m[1].padStart(2,'0')}-${m[2].padStart(2,'0')}${timeStr ? 'T' + timeStr : ''}`)
    if (!isNaN(iso.getTime())) return iso.toISOString()
  }
  return new Date().toISOString()
}

function parseNum(raw: string): number | undefined {
  const n = parseFloat(raw.replace(/[$,\s]/g, ''))
  return isNaN(n) ? undefined : n
}

type AssetRow = { id: string; vin: string | null; fuelCardNumber: string | null }

function findAsset(
  csvVin: string,
  customId: string,
  rawCard: string,
  byVin: Map<string, AssetRow>,
  byCard: Map<string, AssetRow>,
  allAssets: AssetRow[],
): AssetRow | null {
  // 1. Exact VIN match
  if (csvVin) {
    const a = byVin.get(csvVin.toUpperCase())
    if (a) return a
  }
  // 2. Custom Vehicle/Asset ID matches last N chars of any asset's VIN
  if (customId) {
    for (const a of allAssets) {
      if (a.vin && a.vin.toUpperCase().endsWith(customId.toUpperCase())) return a
    }
  }
  // 3. Card number match (cleaned masked card vs fuelCardNumber)
  const cleanedCard = rawCard.replace(/\D/g, '')
  if (cleanedCard) {
    // Direct or partial match
    const direct = byCard.get(cleanedCard)
    if (direct) return direct
    for (const a of allAssets) {
      if (!a.fuelCardNumber) continue
      const c = a.fuelCardNumber.replace(/\D/g, '')
      if (cleanedCard.endsWith(c) || c.endsWith(cleanedCard)) return a
    }
  }
  return null
}

export async function POST(req: NextRequest) {
  let csvText: string
  try {
    const form = await req.formData()
    const file = form.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    csvText = await file.text()
  } catch {
    return NextResponse.json({ error: 'Failed to read file' }, { status: 400 })
  }

  const db = getDb()

  // Load all assets with VIN and fuelCardNumber
  const allAssets: AssetRow[] = await db.select({
    id: assets.id,
    vin: assets.vin,
    fuelCardNumber: assets.fuelCardNumber,
  }).from(assets)

  const byVin  = new Map(allAssets.filter(a => a.vin).map(a => [a.vin!.toUpperCase(), a]))
  const byCard = new Map(allAssets.filter(a => a.fuelCardNumber).map(a => [a.fuelCardNumber!.replace(/\D/g,''), a]))

  const rows = parseCSV(csvText)
  if (rows.length < 2) {
    return NextResponse.json({ error: 'CSV appears empty — need at least a header row and one data row.' }, { status: 400 })
  }

  const headers = rows[0]
  const colMap  = buildColMap(headers)

  if (!('date' in colMap) && !('id' in colMap)) {
    return NextResponse.json({
      error: 'Could not identify WEX columns. Export the full transaction CSV from WEX EFM and try again.',
      detectedHeaders: headers.slice(0, 10),
    }, { status: 400 })
  }

  let total = 0, matched = 0, imported = 0, skipped = 0, unmatched = 0, autoUpdated = 0

  for (const row of rows.slice(1)) {
    if (row.every(c => !c)) continue
    total++

    const csvVin    = col(row, colMap, 'vin')
    const customId  = col(row, colMap, 'customVehicleId')
    const rawCard   = col(row, colMap, 'cardNumber')
    const asset     = findAsset(csvVin, customId, rawCard, byVin, byCard, allAssets)

    if (!asset) { unmatched++; continue }
    matched++

    // Determine card number to store — prefer existing fuelCardNumber, fall back to cleaned masked card
    const cleanedCard = rawCard.replace(/\D/g, '')
    let cardNumber = asset.fuelCardNumber ?? cleanedCard
    if (!cardNumber) { unmatched++; matched--; continue }

    // Auto-populate fuelCardNumber on the asset if not already set
    if (!asset.fuelCardNumber && cleanedCard) {
      await db.update(assets)
        .set({ fuelCardNumber: cleanedCard, updatedAt: new Date().toISOString() })
        .where(eq(assets.id, asset.id))
      asset.fuelCardNumber = cleanedCard
      byCard.set(cleanedCard, asset)
      cardNumber = cleanedCard
      autoUpdated++
    }

    const rawId = col(row, colMap, 'id')
    const id    = rawId || crypto.randomUUID()

    const txn: WexTransaction = {
      id,
      cardNumber,
      date:           parseDateTime(col(row, colMap, 'date'), col(row, colMap, 'time')),
      merchantName:   col(row, colMap, 'merchantName')   || undefined,
      merchantCity:   col(row, colMap, 'merchantCity')   || undefined,
      merchantState:  col(row, colMap, 'merchantState')  || undefined,
      productType:    col(row, colMap, 'productType')    || undefined,
      gallons:        parseNum(col(row, colMap, 'gallons')),
      pricePerGallon: parseNum(col(row, colMap, 'pricePerGallon')),
      totalAmount:    parseNum(col(row, colMap, 'totalAmount')) ?? 0,
      odometer:       parseNum(col(row, colMap, 'odometer')),
      receivedAt:     new Date().toISOString(),
    }

    const returned = await db.insert(wexTransactions).values(txn)
      .onConflictDoNothing()
      .returning({ id: wexTransactions.id })

    if (returned.length > 0) imported++
    else skipped++
  }

  return NextResponse.json({ total, matched, imported, skipped, unmatched, autoUpdated })
}
