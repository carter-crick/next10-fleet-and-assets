import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs/promises'
import path from 'path'
import type { WexTransaction } from '@/lib/types'

const WEX_FILE = path.join(process.cwd(), 'data', 'wex-transactions.json')

export async function GET(_req: NextRequest, { params }: { params: Promise<{ cardNumber: string }> }) {
  const { cardNumber } = await params
  try {
    const raw = await fs.readFile(WEX_FILE, 'utf-8')
    const all: Record<string, WexTransaction[]> = JSON.parse(raw)
    const txns = all[cardNumber] ?? []
    // Return sorted newest first
    return NextResponse.json(txns.sort((a, b) => b.date.localeCompare(a.date)))
  } catch {
    return NextResponse.json([])
  }
}
