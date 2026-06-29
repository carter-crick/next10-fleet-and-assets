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
  const asset = data.assets.find(a => a.id === id)
  if (!asset) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json(asset)
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (process.env.SKIP_AUTH !== 'true') {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const body = await req.json()
  const company = body.company as Company

  const data = await readCompanyData(company)
  const idx = data.assets.findIndex(a => a.id === id)
  if (idx === -1) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  data.assets[idx] = { ...data.assets[idx], ...body, updatedAt: new Date().toISOString() }
  await writeCompanyData(company, data)

  return NextResponse.json(data.assets[idx])
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
  const idx = data.assets.findIndex(a => a.id === id)
  if (idx === -1) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  data.assets.splice(idx, 1)
  data.maintenance = data.maintenance.filter(m => m.assetId !== id)
  await writeCompanyData(company, data)

  return NextResponse.json({ success: true })
}
