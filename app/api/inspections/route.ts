import { NextRequest, NextResponse } from 'next/server'
import { readCompanyData } from '@/lib/data'
import type { Company } from '@/lib/types'

export async function GET(req: NextRequest) {
  const company = req.nextUrl.searchParams.get('company') as Company
  if (!company) return NextResponse.json({ error: 'company required' }, { status: 400 })
  const data = await readCompanyData(company)
  return NextResponse.json(data.inspections)
}
