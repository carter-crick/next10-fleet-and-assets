import { pgTable, text, integer, doublePrecision, timestamp, jsonb } from 'drizzle-orm/pg-core'

export const assets = pgTable('assets', {
  id: text('id').primaryKey(),
  company: text('company').notNull(),
  type: text('type').notNull(),
  name: text('name').notNull(),
  make: text('make'),
  model: text('model'),
  year: integer('year'),
  vin: text('vin'),
  serialNumber: text('serial_number'),
  licensePlate: text('license_plate'),
  licensePlateExpiration: text('license_plate_expiration'),
  color: text('color'),
  lender: text('lender'),
  fuelCardNumber: text('fuel_card_number'),
  inServiceDate: text('in_service_date'),
  outOfServiceDate: text('out_of_service_date'),
  oneStepDeviceId: text('one_step_device_id'),
  status: text('status').notNull(),
  assignedTo: text('assigned_to'),
  location: text('location'),
  notes: text('notes'),
  lastServiceDate: text('last_service_date'),
  nextServiceDue: text('next_service_due'),
  mileage: doublePrecision('mileage'),
  purchaseDate: text('purchase_date'),
  purchasePrice: doublePrecision('purchase_price'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
})

export const maintenanceRecords = pgTable('maintenance_records', {
  id: text('id').primaryKey(),
  assetId: text('asset_id').notNull().references(() => assets.id, { onDelete: 'cascade' }),
  date: text('date').notNull(),
  type: text('type').notNull(),
  description: text('description').notNull(),
  cost: doublePrecision('cost'),
  mileage: doublePrecision('mileage'),
  vendor: text('vendor'),
  notes: text('notes'),
  createdAt: text('created_at').notNull(),
})

export const inspections = pgTable('inspections', {
  id: text('id').primaryKey(),
  assetId: text('asset_id').notNull().references(() => assets.id, { onDelete: 'cascade' }),
  date: text('date').notNull(),
  driver: text('driver').notNull(),
  mileage: doublePrecision('mileage'),
  notes: text('notes'),
  photos: jsonb('photos').$type<string[]>().notNull().default([]),
  createdAt: text('created_at').notNull(),
})

export const drivers = pgTable('drivers', {
  id: text('id').primaryKey(),
  company: text('company').notNull(),
  name: text('name').notNull(),
  dlNumber: text('dl_number').notNull(),
  dlExpiration: text('dl_expiration').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
})
