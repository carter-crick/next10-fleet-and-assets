CREATE TABLE "assets" (
	"id" text PRIMARY KEY NOT NULL,
	"company" text NOT NULL,
	"type" text NOT NULL,
	"name" text NOT NULL,
	"make" text,
	"model" text,
	"year" integer,
	"vin" text,
	"serial_number" text,
	"license_plate" text,
	"license_plate_expiration" text,
	"color" text,
	"lender" text,
	"fuel_card_number" text,
	"in_service_date" text,
	"out_of_service_date" text,
	"one_step_device_id" text,
	"status" text NOT NULL,
	"assigned_to" text,
	"location" text,
	"notes" text,
	"last_service_date" text,
	"next_service_due" text,
	"mileage" double precision,
	"purchase_date" text,
	"purchase_price" double precision,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "drivers" (
	"id" text PRIMARY KEY NOT NULL,
	"company" text NOT NULL,
	"name" text NOT NULL,
	"dl_number" text NOT NULL,
	"dl_expiration" text NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inspections" (
	"id" text PRIMARY KEY NOT NULL,
	"asset_id" text NOT NULL,
	"date" text NOT NULL,
	"driver" text NOT NULL,
	"mileage" double precision,
	"notes" text,
	"photos" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "maintenance_records" (
	"id" text PRIMARY KEY NOT NULL,
	"asset_id" text NOT NULL,
	"date" text NOT NULL,
	"type" text NOT NULL,
	"description" text NOT NULL,
	"cost" double precision,
	"mileage" double precision,
	"vendor" text,
	"notes" text,
	"created_at" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_records" ADD CONSTRAINT "maintenance_records_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;