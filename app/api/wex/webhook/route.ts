import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs/promises'
import path from 'path'
import type { WexTransaction } from '@/lib/types'

const WEX_FILE = path.join(process.cwd(), 'data', 'wex-transactions.json')

async function readTransactions(): Promise<Record<string, WexTransaction[]>> {
  try {
    const raw = await fs.readFile(WEX_FILE, 'utf-8')
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

async function writeTransactions(data: Record<string, WexTransaction[]>) {
  await fs.writeFile(WEX_FILE, JSON.stringify(data, null, 2), 'utf-8')
}

// WEX card numbers in our system are 5-digit shortcodes (e.g. "40972").
// The full card number from WEX may be masked or full-length.
// We match by checking if the WEX card number ends with or contains our stored shortcode.
function matchCardNumber(wexCardNumber: string, storedCards: string[]): string | null {
  const cleaned = wexCardNumber.replace(/\D/g, '') // digits only
  for (const card of storedCards) {
    if (cleaned === card || cleaned.endsWith(card) || cleaned.includes(card)) {
      return card
    }
  }
  return null
}

// WEX Transaction Workflow webhooks can arrive in a few shapes depending on
// the API version. This parser handles both the nested and flat formats.
function parseEvent(event: Record<string, unknown>, knownCards: string[]): WexTransaction | null {
  // Nested format: { transaction: { cardNumber, transactionDate, merchant: {}, lineItems: [] } }
  const txn     = (event.transaction ?? event) as Record<string, unknown>
  const merchant = (txn.merchant   ?? {})      as Record<string, unknown>
  const lineItems = Array.isArray(txn.lineItems) ? txn.lineItems as Record<string, unknown>[] : []
  const firstItem = lineItems[0] ?? {}

  const rawCard = String(txn.cardNumber ?? txn.card_number ?? txn.cardNum ?? event.cardNumber ?? '')
  if (!rawCard) return null

  const matchedCard = matchCardNumber(rawCard, knownCards)
  if (!matchedCard) return null  // card not in our fleet — ignore

  const date = String(
    txn.transactionDate ?? txn.transaction_date ?? txn.date ?? event.transactionDate ?? new Date().toISOString()
  )

  const merchantName = String(
    merchant.name ?? txn.merchantName ?? txn.merchant_name ?? event.merchantName ?? ''
  ) || undefined

  const merchantCity = String(
    merchant.city ?? txn.merchantCity ?? txn.merchant_city ?? event.merchantCity ?? ''
  ) || undefined

  const merchantState = String(
    merchant.state ?? txn.merchantState ?? txn.merchant_state ?? event.merchantState ?? ''
  ) || undefined

  const productType = String(
    firstItem.description ?? firstItem.productCode ?? txn.productDescription ?? txn.product_type ?? ''
  ) || undefined

  const gallons = firstItem.quantity != null
    ? Number(firstItem.quantity)
    : txn.quantity != null ? Number(txn.quantity) : undefined

  const pricePerGallon = firstItem.unitPrice != null
    ? Number(firstItem.unitPrice)
    : txn.unitPrice != null ? Number(txn.unitPrice) : undefined

  const totalAmount = Number(
    txn.totalAmount ?? txn.total_amount ?? firstItem.amount ?? event.totalAmount ?? 0
  )

  const odometer = txn.odometer != null ? Number(txn.odometer) : undefined

  const id = String(
    txn.transactionId ?? txn.transaction_id ?? txn.id ?? event.transactionId ?? crypto.randomUUID()
  )

  return {
    id,
    cardNumber: matchedCard,
    date,
    merchantName,
    merchantCity,
    merchantState,
    productType,
    gallons: gallons != null && !isNaN(gallons) ? gallons : undefined,
    pricePerGallon: pricePerGallon != null && !isNaN(pricePerGallon) ? pricePerGallon : undefined,
    totalAmount: isNaN(totalAmount) ? 0 : totalAmount,
    odometer: odometer != null && !isNaN(odometer) ? odometer : undefined,
    receivedAt: new Date().toISOString(),
  }
}

export async function POST(req: NextRequest) {
  // Optional shared secret: set WEX_WEBHOOK_SECRET in .env.local
  const secret = process.env.WEX_WEBHOOK_SECRET
  if (secret) {
    const provided = req.nextUrl.searchParams.get('secret') ?? req.headers.get('x-webhook-secret') ?? ''
    if (provided !== secret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Load current transactions to get the list of known card numbers
  const allTransactions = await readTransactions()
  const knownCards = Object.keys(allTransactions)

  // Also pull card numbers from both company data files so we can match
  // even before any transactions have been stored
  try {
    const bcRaw = await fs.readFile(path.join(process.cwd(), 'data', 'balanced-comfort.json'), 'utf-8')
    const saRaw = await fs.readFile(path.join(process.cwd(), 'data', 'sailors-air.json'), 'utf-8')
    const bcData = JSON.parse(bcRaw)
    const saData = JSON.parse(saRaw)
    for (const asset of [...(bcData.assets ?? []), ...(saData.assets ?? [])]) {
      if (asset.fuelCardNumber && !knownCards.includes(asset.fuelCardNumber)) {
        knownCards.push(asset.fuelCardNumber)
      }
    }
  } catch { /* files may not exist yet */ }

  const events = Array.isArray(body) ? body as Record<string, unknown>[] : [body as Record<string, unknown>]

  let added = 0
  for (const event of events) {
    const txn = parseEvent(event, knownCards)
    if (!txn) continue

    if (!allTransactions[txn.cardNumber]) allTransactions[txn.cardNumber] = []

    // Deduplicate by transaction ID
    const exists = allTransactions[txn.cardNumber].some(t => t.id === txn.id)
    if (!exists) {
      allTransactions[txn.cardNumber].unshift(txn)
      // Keep most recent 500 transactions per card
      if (allTransactions[txn.cardNumber].length > 500) {
        allTransactions[txn.cardNumber] = allTransactions[txn.cardNumber].slice(0, 500)
      }
      added++
    }
  }

  if (added > 0) await writeTransactions(allTransactions)

  return NextResponse.json({ received: events.length, added })
}
