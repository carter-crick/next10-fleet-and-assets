import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs/promises'
import path from 'path'
import type { DriveStop } from '@/lib/types'

const TRIPS_FILE = path.join(process.cwd(), 'data', 'drive-stops.json')

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ deviceId: string }> }
) {
  const { deviceId } = await params
  const limit = Math.min(Number(req.nextUrl.searchParams.get('limit') ?? '50'), 200)
  try {
    const data: Record<string, DriveStop[]> = JSON.parse(await fs.readFile(TRIPS_FILE, 'utf-8'))
    const trips = (data[deviceId] ?? []).slice(0, limit)
    return NextResponse.json(trips)
  } catch {
    return NextResponse.json([])
  }
}
