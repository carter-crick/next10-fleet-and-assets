import { NextRequest, NextResponse } from 'next/server'
import { eq, desc, inArray, isNotNull } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import { assets, wexTransactions } from '@/lib/db/schema'
import type { WexTransaction } from '@/lib/types'

function matchCardNumber(wexCardNumber: string, storedCards: string[]): string | null {
  const cleaned = wexCardNumber.replace(/\D/g, '')
  for (const card of storedCards) {
    if (cleaned === card || cleaned.endsWith(card) || cleaned.includes(card)) return card
  }
  return null
}

function parseEvent(event: Record<string, unknown>, knownCards: string[]): WexTransaction | null {
  const txn      = (event.transaction ?? event) as Record<string, unknown>
  const merchant = (txn.merchant ?? {})          as Record<string, unknown>
  const lineItems = Array.isArray(txn.lineItems) ? txn.lineItems as Record<string, unknown>[] : []
  const firstItem = lineItems[0] ?? {}

  const rawCard = String(txn.cardNumber ?? txn.card_number ?? txn.cardNum ?? event.cardNumber ?? '')
  if (!rawCard) return null

  const matchedCard = matchCardNumber(rawCard, knownCards)
  if (!matchedCard) return null

  const date = String(txn.transactionDate ?? txn.transaction_date ?? txn.date ?? event.transactionDate ?? new Date().toISOString())
  const merchantName  = String(merchant.name  ?? txn.merchantName  ?? txn.merchant_name  ?? '') || undefined
  const merchantCity  = String(merchant.city  ?? txn.merchantCity  ?? txn.merchant_city  ?? '') || undefined
  const merchantState = String(merchant.state ?? txn.merchantState ?? txn.merchant_state ?? '') || undefined
  const productType   = String(firstItem.description ?? firstItem.productCode ?? txn.productDescription ?? txn.product_type ?? '') || undefined

  const gallons        = firstItem.quantity != null ? Number(firstItem.quantity) : txn.quantity != null ? Number(txn.quantity) : undefined
  const pricePerGallon = firstItem.unitPrice != null ? Number(firstItem.unitPrice) : txn.unitPrice != null ? Number(txn.unitPrice) : undefined
  const totalAmount    = Number(txn.totalAmount ?? txn.total_amount ?? firstItem.amount ?? event.totalAmount ?? 0)
  const odometer       = txn.odometer != null ? Number(txn.odometer) : undefined
  const id             = String(txn.transactionId ?? txn.transaction_id ?? txn.id ?? event.transactionId ?? crypto.randomUUID())

  return {
    id, cardNumber: matchedCard, date,
    merchantName, merchantCity, merchantState, productType,
    gallons:        gallons        != null && !isNaN(gallons)        ? gallons        : undefined,
    pricePerGallon: pricePerGallon != null && !isNaN(pricePerGallon) ? pricePerGallon : undefined,
    totalAmount:    isNaN(totalAmount) ? 0 : totalAmount,
    odometer:       odometer       != null && !isNaN(odometer)       ? odometer       : undefined,
    receivedAt: new Date().toISOString(),
  }
}

export async function POST(req: NextRequest) {
  const secret = process.env.WEX_WEBHOOK_SECRET
  if (secret) {
    const provided = req.nextUrl.searchParams.get('secret') ?? req.headers.get('x-webhook-secret') ?? ''
    if (provided !== secret) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: unknown
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const db = getDb()

  // Load known fuel card numbers from DB
  const fuelCardRows = await db.select({ fuelCardNumber: assets.fuelCardNumber })
    .from(assets).where(isNotNull(assets.fuelCardNumber))
  const knownCards = fuelCardRows.map(r => r.fuelCardNumber!)

  const events = Array.isArray(body) ? body as Record<string, unknown>[] : [body as Record<string, unknown>]
  let added = 0

  for (const event of events) {
    const txn = parseEvent(event, knownCards)
    if (!txn) continue

    await db.insert(wexTransactions).values(txn).onConflictDoNothing()
    added++

    // Keep only 500 most recent per card
    const all = await db.select({ id: wexTransactions.id })
      .from(wexTransactions).where(eq(wexTransactions.cardNumber, txn.cardNumber))
      .orderBy(desc(wexTransactions.date))
    if (all.length > 500) {
      await db.delete(wexTransactions)
        .where(inArray(wexTransactions.id, all.slice(500).map(r => r.id)))
    }
  }

  return NextResponse.json({ received: events.length, added })
}
