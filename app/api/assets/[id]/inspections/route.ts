import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { readCompanyData, writeCompanyData } from '@/lib/data'
import type { Company } from '@/lib/types'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (process.env.SKIP_AUTH !== 'true') {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const company = req.nextUrl.searchParams.get('company') as Company
  if (!company) return NextResponse.json({ error: 'company required' }, { status: 400 })

  const data = await readCompanyData(company)
  const records = (data.inspections ?? [])
    .filter(r => r.assetId === id)
    .sort((a, b) => b.date.localeCompare(a.date))

  return NextResponse.json(records)
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (process.env.SKIP_AUTH !== 'true') {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const body = await req.json()
  const company = body.company as Company

  const data = await readCompanyData(company)
  const record = {
    id: crypto.randomUUID(),
    assetId: id,
    date: body.date,
    driver: body.driver,
    ...(body.mileage !== undefined && { mileage: body.mileage }),
    ...(body.notes   && { notes: body.notes }),
    photos: body.photos ?? [],
    createdAt: new Date().toISOString(),
  }
  if (!data.inspections) data.inspections = []
  data.inspections.push(record)
  await writeCompanyData(company, data)

  return NextResponse.json(record, { status: 201 })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (process.env.SKIP_AUTH !== 'true') {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const company = req.nextUrl.searchParams.get('company') as Company
  const recordId = req.nextUrl.searchParams.get('recordId')
  if (!company || !recordId) return NextResponse.json({ error: 'company and recordId required' }, { status: 400 })

  const data = await readCompanyData(company)
  data.inspections = (data.inspections ?? []).filter(r => !(r.assetId === id && r.id === recordId))
  await writeCompanyData(company, data)

  return NextResponse.json({ success: true })
}
