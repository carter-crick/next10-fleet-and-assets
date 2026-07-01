import { NextRequest, NextResponse } from 'next/server'
import { sql } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import type { Company } from '@/lib/types'

export interface MaintenanceMonthStat {
  month: string        // 'YYYY-MM'
  label: string        // 'Jun 2026'
  spend: number
  records: number
  vehicles: number
  avgPerVehicle: number
}

export interface MaintenanceStats {
  mtd: MaintenanceMonthStat
  months: MaintenanceMonthStat[]  // last 12 months with activity, newest first
}

function makeLabel(yyyymm: string): string {
  const [y, m] = yyyymm.split('-')
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

export async function GET(req: NextRequest) {
  const company = req.nextUrl.searchParams.get('company') as Company
  if (!company) return NextResponse.json({ error: 'company required' }, { status: 400 })

  const db = getDb()

  // Aggregate maintenance spend per month, joined through assets to scope by company
  const rows = await db.execute(sql`
    SELECT
      TO_CHAR(mr.date::timestamp AT TIME ZONE 'America/Los_Angeles', 'YYYY-MM') AS month,
      COALESCE(SUM(mr.cost), 0)::float                                            AS spend,
      COUNT(mr.id)::int                                                            AS records,
      COUNT(DISTINCT mr.asset_id)::int                                             AS vehicles
    FROM maintenance_records mr
    JOIN assets a ON a.id = mr.asset_id
    WHERE a.company = ${company}
      AND mr.cost IS NOT NULL
      AND mr.cost > 0
      AND mr.date::timestamp >= NOW() - INTERVAL '13 months'
    GROUP BY 1
    ORDER BY 1 DESC
  `)

  const byMonth = new Map<string, { spend: number; records: number; vehicles: number }>()
  for (const r of rows.rows as { month: string; spend: number; records: number; vehicles: number }[]) {
    byMonth.set(r.month, { spend: r.spend, records: r.records, vehicles: r.vehicles })
  }

  const currentMonth = new Date().toLocaleDateString('en-CA', { year: 'numeric', month: '2-digit', timeZone: 'America/Los_Angeles' }).slice(0, 7)
  const mtdRaw = byMonth.get(currentMonth) ?? { spend: 0, records: 0, vehicles: 0 }
  const mtd: MaintenanceMonthStat = {
    month:          currentMonth,
    label:          makeLabel(currentMonth),
    spend:          Math.round(mtdRaw.spend * 100) / 100,
    records:        mtdRaw.records,
    vehicles:       mtdRaw.vehicles,
    avgPerVehicle:  mtdRaw.vehicles > 0 ? Math.round((mtdRaw.spend / mtdRaw.vehicles) * 100) / 100 : 0,
  }

  const months: MaintenanceMonthStat[] = Array.from(byMonth.entries())
    .filter(([m]) => m !== currentMonth)
    .map(([month, d]) => ({
      month,
      label:         makeLabel(month),
      spend:         Math.round(d.spend * 100) / 100,
      records:       d.records,
      vehicles:      d.vehicles,
      avgPerVehicle: d.vehicles > 0 ? Math.round((d.spend / d.vehicles) * 100) / 100 : 0,
    }))
    .sort((a, b) => b.month.localeCompare(a.month))

  return NextResponse.json({ mtd, months } satisfies MaintenanceStats)
}
