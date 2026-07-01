import { NextRequest, NextResponse } from 'next/server'
import { isNotNull } from 'drizzle-orm'
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

const COL_ALIASES: Record<string, string[]> = {
  date:           ['transactiondate', 'transdate', 'date', 'txndate', 'postdate', 'postingdate', 'trandate'],
  cardNumber:     ['cardnumber', 'cardno', 'cardnbr', 'card', 'cardnum', 'cardlast4', 'cardaccount'],
  merchantName:   ['merchantname', 'merchant', 'station', 'vendor', 'locationname', 'stationname', 'location'],
  merchantCity:   ['merchantcity', 'city', 'merchcity', 'stationcity'],
  merchantState:  ['merchantstate', 'state', 'merchstate', 'stateabbr', 'st'],
  productType:    ['product', 'productdescription', 'productdesc', 'producttype', 'fueltype', 'description', 'itemdescription'],
  gallons:        ['gallons', 'quantity', 'qty', 'volume', 'unitquantity', 'quantitypurchased'],
  pricePerGallon: ['unitprice', 'pricepergallon', 'pricegal', 'unitcost', 'perprice', 'priceunit'],
  totalAmount:    ['total', 'totalamount', 'netcost', 'grosscost', 'amount', 'nettotal', 'grosstotal', 'invoiceamount', 'netamount', 'grossamount'],
  odometer:       ['odometer', 'odo', 'odometerreading', 'odoreading', 'mileage', 'vehicleodometer'],
  id:             ['transactionid', 'transid', 'txnid', 'txnnbr', 'transactionno', 'transno', 'referencenumber', 'refno', 'confirmationno'],
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

function matchCard(rawCard: string, knownCards: string[]): string | null {
  const cleaned = rawCard.replace(/\D/g, '')
  if (!cleaned) return null
  for (const card of knownCards) {
    const c = card.replace(/\D/g, '')
    if (cleaned === c || cleaned.endsWith(c) || c.endsWith(cleaned)) return card
  }
  return null
}

function parseDate(raw: string): string {
  if (!raw) return new Date().toISOString()
  const d = new Date(raw)
  if (!isNaN(d.getTime())) return d.toISOString()
  // Try MM/DD/YYYY
  const mmddyyyy = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (mmddyyyy) return new Date(`${mmddyyyy[3]}-${mmddyyyy[1].padStart(2,'0')}-${mmddyyyy[2].padStart(2,'0')}`).toISOString()
  return new Date().toISOString()
}

function parseNum(raw: string): number | undefined {
  const n = parseFloat(raw.replace(/[$,\s]/g, ''))
  return isNaN(n) ? undefined : n
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
  const cardRows = await db.select({ fuelCardNumber: assets.fuelCardNumber })
    .from(assets).where(isNotNull(assets.fuelCardNumber))
  const knownCards = cardRows.map(r => r.fuelCardNumber!)

  const rows = parseCSV(csvText)
  if (rows.length < 2) {
    return NextResponse.json({ error: 'CSV appears empty — need at least a header row and one data row.' }, { status: 400 })
  }

  const headers = rows[0]
  const colMap  = buildColMap(headers)

  if (!('date' in colMap) && !('cardNumber' in colMap)) {
    return NextResponse.json({
      error: 'Could not identify WEX columns in this CSV. Make sure you exported from WEX EFM Transactions.',
      detectedHeaders: headers.slice(0, 10),
    }, { status: 400 })
  }

  let total = 0, matched = 0, imported = 0, skipped = 0, unmatched = 0

  for (const row of rows.slice(1)) {
    if (row.every(c => !c)) continue
    total++

    const rawCard = col(row, colMap, 'cardNumber')
    const card    = matchCard(rawCard, knownCards)
    if (!card) { unmatched++; continue }
    matched++

    const rawId = col(row, colMap, 'id')
    const id    = rawId || crypto.randomUUID()

    const txn: WexTransaction = {
      id,
      cardNumber:     card,
      date:           parseDate(col(row, colMap, 'date')),
      merchantName:   col(row, colMap, 'merchantName')  || undefined,
      merchantCity:   col(row, colMap, 'merchantCity')  || undefined,
      merchantState:  col(row, colMap, 'merchantState') || undefined,
      productType:    col(row, colMap, 'productType')   || undefined,
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

  return NextResponse.json({ total, matched, imported, skipped, unmatched })
}
