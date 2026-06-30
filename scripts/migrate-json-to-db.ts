import fs from 'fs/promises'
import path from 'path'
import { getDb } from '@/lib/db'
import { assets, maintenanceRecords, inspections, drivers } from '@/lib/db/schema'
import type { Company, CompanyData } from '@/lib/types'

const COMPANIES: Company[] = ['balanced-comfort', 'sailors-air']

async function readJson(company: Company): Promise<CompanyData> {
  try {
    const raw = await fs.readFile(path.join(process.cwd(), 'data', `${company}.json`), 'utf-8')
    const data = JSON.parse(raw)
    return {
      assets: data.assets ?? [],
      maintenance: data.maintenance ?? [],
      inspections: data.inspections ?? [],
      drivers: data.drivers ?? [],
    }
  } catch {
    return { assets: [], maintenance: [], inspections: [], drivers: [] }
  }
}

async function main() {
  const db = getDb()

  for (const company of COMPANIES) {
    const data = await readJson(company)
    console.log(`${company}: ${data.assets.length} assets, ${data.maintenance.length} maintenance, ${data.inspections.length} inspections, ${data.drivers.length} drivers`)

    if (data.assets.length) await db.insert(assets).values(data.assets).onConflictDoNothing()
    if (data.maintenance.length) await db.insert(maintenanceRecords).values(data.maintenance).onConflictDoNothing()
    if (data.inspections.length) await db.insert(inspections).values(data.inspections).onConflictDoNothing()
    if (data.drivers.length) await db.insert(drivers).values(data.drivers).onConflictDoNothing()
  }

  console.log('Done.')
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(err)
  process.exit(1)
})
