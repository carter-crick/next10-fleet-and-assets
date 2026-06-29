import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { readCompanyData, writeCompanyData } from '@/lib/data'
import type { Company, AssetType } from '@/lib/types'

export async function GET(req: NextRequest) {
  if (process.env.SKIP_AUTH !== 'true') {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = req.nextUrl
  const company = searchParams.get('company') as Company
  const type = searchParams.get('type') as AssetType | null

  if (!company) return NextResponse.json({ error: 'company required' }, { status: 400 })

  const data = await readCompanyData(company)
  const assets = type ? data.assets.filter(a => a.type === type) : data.assets

  return NextResponse.json(assets)
}

export async function POST(req: NextRequest) {
  if (process.env.SKIP_AUTH !== 'true') {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const { company, ...assetData } = body

  if (!company) return NextResponse.json({ error: 'company required' }, { status: 400 })

  const data = await readCompanyData(company)
  const now = new Date().toISOString()
  const asset = {
    id: crypto.randomUUID(),
    company,
    ...assetData,
    createdAt: now,
    updatedAt: now,
  }
  data.assets.push(asset)
  await writeCompanyData(company, data)

  return NextResponse.json(asset, { status: 201 })
}
