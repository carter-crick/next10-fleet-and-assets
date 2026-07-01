import { NextRequest, NextResponse } from 'next/server'
import { eq, desc } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import { wexTransactions } from '@/lib/db/schema'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ cardNumber: string }> }) {
  const { cardNumber } = await params
  const db = getDb()
  const txns = await db.select().from(wexTransactions)
    .where(eq(wexTransactions.cardNumber, cardNumber))
    .orderBy(desc(wexTransactions.date))
  return NextResponse.json(txns)
}
