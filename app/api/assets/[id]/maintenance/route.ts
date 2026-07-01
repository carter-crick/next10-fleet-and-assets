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
  const records = data.maintenance
    .filter(m => m.assetId === id)
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
    ...body,
    createdAt: new Date().toISOString(),
  }
  data.maintenance.push(record)
  await writeCompanyData(company, data)

  return NextResponse.json(record, { status: 201 })
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (process.env.SKIP_AUTH !== 'true') {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const body = await req.json()
  const { company, recordId, ...fields } = body as { company: Company; recordId: string; [k: string]: unknown }
  if (!company || !recordId) return NextResponse.json({ error: 'company and recordId required' }, { status: 400 })

  const data = await readCompanyData(company)
  const idx = data.maintenance.findIndex(m => m.assetId === id && m.id === recordId)
  if (idx === -1) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  data.maintenance[idx] = { ...data.maintenance[idx], ...fields }
  await writeCompanyData(company, data)

  return NextResponse.json(data.maintenance[idx])
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
  data.maintenance = data.maintenance.filter(m => !(m.assetId === id && m.id === recordId))
  await writeCompanyData(company, data)

  return NextResponse.json({ success: true })
}
