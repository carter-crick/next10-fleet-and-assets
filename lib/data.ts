import { eq, inArray } from 'drizzle-orm'
import { getDb } from './db'
import { assets, maintenanceRecords, inspections, drivers } from './db/schema'
import type { Company, CompanyData } from './types'

export async function readCompanyData(company: Company): Promise<CompanyData> {
  const db = getDb()

  const companyAssets = await db.select().from(assets).where(eq(assets.company, company))
  const assetIds = companyAssets.map(a => a.id)

  const [companyMaintenance, companyInspections, companyDrivers] = await Promise.all([
    assetIds.length
      ? db.select().from(maintenanceRecords).where(inArray(maintenanceRecords.assetId, assetIds))
      : Promise.resolve([]),
    assetIds.length
      ? db.select().from(inspections).where(inArray(inspections.assetId, assetIds))
      : Promise.resolve([]),
    db.select().from(drivers).where(eq(drivers.company, company)),
  ])

  return {
    assets: companyAssets as CompanyData['assets'],
    maintenance: companyMaintenance as CompanyData['maintenance'],
    inspections: companyInspections as CompanyData['inspections'],
    drivers: companyDrivers as CompanyData['drivers'],
  }
}

export async function writeCompanyData(company: Company, data: CompanyData): Promise<void> {
  const db = getDb()

  // neon-http has no interactive transactions, so the whole replace is sent
  // as a single atomic batch (deleting assets cascades to maintenance/inspections).
  const queries = [
    db.delete(assets).where(eq(assets.company, company)),
    db.delete(drivers).where(eq(drivers.company, company)),
    ...(data.assets.length ? [db.insert(assets).values(data.assets)] : []),
    ...(data.maintenance.length ? [db.insert(maintenanceRecords).values(data.maintenance)] : []),
    ...(data.inspections.length ? [db.insert(inspections).values(data.inspections)] : []),
    ...(data.drivers.length ? [db.insert(drivers).values(data.drivers)] : []),
  ] as Parameters<typeof db.batch>[0]

  await db.batch(queries)
}
