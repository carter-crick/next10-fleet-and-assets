export type Company = 'balanced-comfort' | 'sailors-air'
export type AssetType = 'vehicle' | 'equipment' | 'trailer'
export type AssetStatus = 'active' | 'open' | 'maintenance' | 'out-of-service' | 'retired'

export interface Asset {
  id: string
  company: Company
  type: AssetType
  name: string
  make?: string
  model?: string
  year?: number
  vin?: string
  serialNumber?: string
  licensePlate?: string
  licensePlateExpiration?: string
  color?: string
  lender?: string
  fuelCardNumber?: string
  inServiceDate?: string
  outOfServiceDate?: string
  oneStepDeviceId?: string
  status: AssetStatus
  assignedTo?: string
  location?: string
  notes?: string
  lastServiceDate?: string
  lastServiceMileage?: number
  nextServiceDue?: string
  mileage?: number
  purchaseDate?: string
  purchasePrice?: number
  createdAt: string
  updatedAt: string
}

export interface MaintenanceRecord {
  id: string
  assetId: string
  date: string
  type: string
  description: string
  cost?: number
  mileage?: number
  vendor?: string
  notes?: string
  createdAt: string
}

export interface Driver {
  id: string
  company: Company
  name: string
  dlNumber: string
  dlExpiration: string
  createdAt: string
  updatedAt: string
}

export interface InspectionRecord {
  id: string
  assetId: string
  date: string
  driver: string
  mileage?: number
  notes?: string
  photos: string[]
  createdAt: string
}

export interface WexTransaction {
  id: string
  cardNumber: string
  date: string
  merchantName?: string
  merchantCity?: string
  merchantState?: string
  productType?: string
  gallons?: number
  pricePerGallon?: number
  totalAmount: number
  odometer?: number
  receivedAt: string
}

export interface GpsLocation {
  deviceId: string
  lat: number
  lng: number
  speed?: number       // mph
  heading?: number
  address?: string
  odometer?: number    // miles
  engineHours?: number
  driveStatus?: string // 'driving' | 'idle' | 'off'
  fuelPercent?: number
  timestamp: string
  receivedAt: string
}

export interface DriveStop {
  id: string
  deviceId: string
  type: 'drive' | 'stop'
  timeFrom: string
  timeTo: string
  durationSec: number
  distanceMi?: number
  odometerFromMi?: number
  odometerToMi?: number
  avgSpeedMph?: number
  topSpeedMph?: number
  idleDurationSec?: number
  latFrom?: number
  lngFrom?: number
  latTo?: number
  lngTo?: number
  zoneFrom?: string
  zoneTo?: string
  events?: Record<string, number>
  isIncomplete?: boolean
  receivedAt: string
}

export interface CompanyData {
  assets: Asset[]
  maintenance: MaintenanceRecord[]
  inspections: InspectionRecord[]
  drivers: Driver[]
}
