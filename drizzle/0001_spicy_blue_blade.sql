CREATE TABLE "drive_stops" (
	"id" text PRIMARY KEY NOT NULL,
	"device_id" text NOT NULL,
	"type" text NOT NULL,
	"time_from" text NOT NULL,
	"time_to" text NOT NULL,
	"duration_sec" double precision DEFAULT 0 NOT NULL,
	"distance_mi" double precision,
	"odometer_from_mi" double precision,
	"odometer_to_mi" double precision,
	"avg_speed_mph" double precision,
	"top_speed_mph" double precision,
	"idle_duration_sec" double precision,
	"lat_from" double precision,
	"lng_from" double precision,
	"lat_to" double precision,
	"lng_to" double precision,
	"zone_from" text,
	"zone_to" text,
	"events" jsonb,
	"is_incomplete" text,
	"received_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gps_locations" (
	"device_id" text PRIMARY KEY NOT NULL,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"speed" double precision,
	"heading" double precision,
	"address" text,
	"odometer" double precision,
	"engine_hours" double precision,
	"drive_status" text,
	"fuel_percent" double precision,
	"timestamp" text NOT NULL,
	"received_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wex_transactions" (
	"id" text PRIMARY KEY NOT NULL,
	"card_number" text NOT NULL,
	"date" text NOT NULL,
	"merchant_name" text,
	"merchant_city" text,
	"merchant_state" text,
	"product_type" text,
	"gallons" double precision,
	"price_per_gallon" double precision,
	"total_amount" double precision NOT NULL,
	"odometer" double precision,
	"received_at" text NOT NULL
);
--> statement-breakpoint
CREATE INDEX "drive_stops_device_id_idx" ON "drive_stops" USING btree ("device_id");--> statement-breakpoint
CREATE INDEX "wex_transactions_card_number_idx" ON "wex_transactions" USING btree ("card_number");