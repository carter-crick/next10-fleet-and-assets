import fs from 'fs/promises'
import path from 'path'
import type { Company, CompanyData } from './types'

const DATA_DIR = path.join(process.cwd(), 'data')

function dataFile(company: Company) {
  return path.join(DATA_DIR, `${company}.json`)
}

export async function readCompanyData(company: Company): Promise<CompanyData> {
  try {
    const raw = await fs.readFile(dataFile(company), 'utf-8')
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

export async function writeCompanyData(company: Company, data: CompanyData): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true })
  await fs.writeFile(dataFile(company), JSON.stringify(data, null, 2), 'utf-8')
}
