import { NextRequest, NextResponse } from 'next/server'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'
import { auth } from '@/auth'

export async function POST(req: NextRequest) {
  if (process.env.SKIP_AUTH !== 'true') {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const assetId = req.nextUrl.searchParams.get('assetId')
  if (!assetId) return NextResponse.json({ error: 'assetId required' }, { status: 400 })

  const formData = await req.formData()
  const files = formData.getAll('files') as File[]
  if (!files.length) return NextResponse.json({ urls: [] })

  const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'inspections', assetId)
  await mkdir(uploadDir, { recursive: true })

  const urls: string[] = []
  for (const file of files) {
    if (!file.size) continue
    const bytes = await file.arrayBuffer()
    const ext = path.extname(file.name) || '.jpg'
    const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`
    await writeFile(path.join(uploadDir, filename), Buffer.from(bytes))
    urls.push(`/uploads/inspections/${assetId}/${filename}`)
  }

  return NextResponse.json({ urls })
}
