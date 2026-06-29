import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { readCompanyData, writeCompanyData } from '@/lib/data'
import type { Company } from '@/lib/types'

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (process.env.SKIP_AUTH !== 'true') {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const body = await req.json()
  const company = body.company as Company

  const data = await readCompanyData(company)
  const idx = data.drivers.findIndex(d => d.id === id)
  if (idx === -1) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  data.drivers[idx] = { ...data.drivers[idx], ...body, updatedAt: new Date().toISOString() }
  await writeCompanyData(company, data)

  return NextResponse.json(data.drivers[idx])
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (process.env.SKIP_AUTH !== 'true') {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const company = req.nextUrl.searchParams.get('company') as Company
  if (!company) return NextResponse.json({ error: 'company required' }, { status: 400 })

  const data = await readCompanyData(company)
  data.drivers = data.drivers.filter(d => d.id !== id)
  await writeCompanyData(company, data)

  return NextResponse.json({ success: true })
}
