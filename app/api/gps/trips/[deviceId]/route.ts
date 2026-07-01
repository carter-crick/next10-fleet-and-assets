import { NextRequest, NextResponse } from 'next/server'
import { eq, desc } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import { driveStops } from '@/lib/db/schema'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ deviceId: string }> }
) {
  const { deviceId } = await params
  const limit = Math.min(Number(req.nextUrl.searchParams.get('limit') ?? '50'), 200)
  const db = getDb()
  const trips = await db.select().from(driveStops)
    .where(eq(driveStops.deviceId, deviceId))
    .orderBy(desc(driveStops.timeFrom))
    .limit(limit)
  return NextResponse.json(trips)
}
