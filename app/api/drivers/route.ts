import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { readCompanyData, writeCompanyData } from '@/lib/data'
import type { Company } from '@/lib/types'

export async function GET(req: NextRequest) {
  if (process.env.SKIP_AUTH !== 'true') {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const company = req.nextUrl.searchParams.get('company') as Company
  if (!company) return NextResponse.json({ error: 'company required' }, { status: 400 })

  const data = await readCompanyData(company)
  return NextResponse.json(data.drivers)
}

export async function POST(req: NextRequest) {
  if (process.env.SKIP_AUTH !== 'true') {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const { company, ...driverData } = body
  if (!company) return NextResponse.json({ error: 'company required' }, { status: 400 })

  const data = await readCompanyData(company)
  const now = new Date().toISOString()
  const driver = {
    id: crypto.randomUUID(),
    company,
    ...driverData,
    createdAt: now,
    updatedAt: now,
  }
  data.drivers.push(driver)
  await writeCompanyData(company, data)

  return NextResponse.json(driver, { status: 201 })
}
