import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Mobile prices and specs (phone-brands, phones). Additive and idempotent only, so the old web container keeps
// working while the new one boots and migrates: new tables, new enum types, two new nullable columns on
// payload_locked_documents_rels. (The generated diff also wanted to drop media._objectkey and re-add the
// 'sports' category value; both were removed on purpose: the old release still reads _objectkey and prod already has 'sports'.)
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  DO $$ BEGIN CREATE TYPE "public"."enum_phones_status" AS ENUM('current', 'discontinued', 'upcoming'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  DO $$ BEGIN CREATE TYPE "public"."enum_phones_pta_status" AS ENUM('approved', 'not-listed', 'unknown'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

  CREATE TABLE IF NOT EXISTS "phone_brands" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"slug" varchar NOT NULL,
  	"order" numeric DEFAULT 100,
  	"official_site" varchar,
  	"description" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE IF NOT EXISTS "phones" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"slug" varchar NOT NULL,
  	"brand_id" integer NOT NULL,
  	"launch_date" timestamp(3) with time zone,
  	"status" "enum_phones_status" DEFAULT 'current',
  	"hidden" boolean DEFAULT false,
  	"popularity" numeric DEFAULT 0,
  	"image_url" varchar,
  	"official_url" varchar,
  	"summary" varchar,
  	"price_pkr" numeric,
  	"price_updated_at" timestamp(3) with time zone,
  	"pta_status" "enum_phones_pta_status",
  	"pta_tax_pkr" numeric,
  	"pta_source_url" varchar,
  	"pta_note" varchar,
  	"specs_display_size" varchar,
  	"specs_display_type" varchar,
  	"specs_display_resolution" varchar,
  	"specs_refresh_rate_hz" numeric,
  	"specs_chipset" varchar,
  	"specs_os" varchar,
  	"specs_network" varchar,
  	"specs_sim" varchar,
  	"specs_rear_camera" varchar,
  	"specs_front_camera" varchar,
  	"specs_battery_mah" numeric,
  	"specs_charging_w" numeric,
  	"specs_weight_g" numeric,
  	"specs_dimensions" varchar,
  	"specs_protection" varchar,
  	"specs_source_url" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE IF NOT EXISTS "phones_colours" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL
  );

  CREATE TABLE IF NOT EXISTS "phones_variants" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"ram_gb" numeric,
  	"storage_gb" numeric NOT NULL,
  	"price_pkr" numeric,
  	"price_source_url" varchar,
  	"price_checked_at" timestamp(3) with time zone
  );

  CREATE TABLE IF NOT EXISTS "phones_price_history" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"date" timestamp(3) with time zone NOT NULL,
  	"variant" varchar NOT NULL,
  	"price_pkr" numeric NOT NULL,
  	"source_url" varchar
  );

  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "phone_brands_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "phones_id" integer;

  DO $$ BEGIN ALTER TABLE "phones_colours" ADD CONSTRAINT "phones_colours_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."phones"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  DO $$ BEGIN ALTER TABLE "phones_variants" ADD CONSTRAINT "phones_variants_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."phones"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  DO $$ BEGIN ALTER TABLE "phones_price_history" ADD CONSTRAINT "phones_price_history_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."phones"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  DO $$ BEGIN ALTER TABLE "phones" ADD CONSTRAINT "phones_brand_id_phone_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."phone_brands"("id") ON DELETE set null ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  DO $$ BEGIN ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_phone_brands_fk" FOREIGN KEY ("phone_brands_id") REFERENCES "public"."phone_brands"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  DO $$ BEGIN ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_phones_fk" FOREIGN KEY ("phones_id") REFERENCES "public"."phones"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

  CREATE UNIQUE INDEX IF NOT EXISTS "phone_brands_slug_idx" ON "phone_brands" USING btree ("slug");
  CREATE INDEX IF NOT EXISTS "phone_brands_updated_at_idx" ON "phone_brands" USING btree ("updated_at");
  CREATE INDEX IF NOT EXISTS "phone_brands_created_at_idx" ON "phone_brands" USING btree ("created_at");
  CREATE INDEX IF NOT EXISTS "phones_colours_order_idx" ON "phones_colours" USING btree ("_order");
  CREATE INDEX IF NOT EXISTS "phones_colours_parent_id_idx" ON "phones_colours" USING btree ("_parent_id");
  CREATE INDEX IF NOT EXISTS "phones_variants_order_idx" ON "phones_variants" USING btree ("_order");
  CREATE INDEX IF NOT EXISTS "phones_variants_parent_id_idx" ON "phones_variants" USING btree ("_parent_id");
  CREATE INDEX IF NOT EXISTS "phones_price_history_order_idx" ON "phones_price_history" USING btree ("_order");
  CREATE INDEX IF NOT EXISTS "phones_price_history_parent_id_idx" ON "phones_price_history" USING btree ("_parent_id");
  CREATE UNIQUE INDEX IF NOT EXISTS "phones_slug_idx" ON "phones" USING btree ("slug");
  CREATE INDEX IF NOT EXISTS "phones_brand_idx" ON "phones" USING btree ("brand_id");
  CREATE INDEX IF NOT EXISTS "phones_popularity_idx" ON "phones" USING btree ("popularity");
  CREATE INDEX IF NOT EXISTS "phones_price_pkr_idx" ON "phones" USING btree ("price_pkr");
  CREATE INDEX IF NOT EXISTS "phones_updated_at_idx" ON "phones" USING btree ("updated_at");
  CREATE INDEX IF NOT EXISTS "phones_created_at_idx" ON "phones" USING btree ("created_at");
  CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_phone_brands_id_idx" ON "payload_locked_documents_rels" USING btree ("phone_brands_id");
  CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_phones_id_idx" ON "payload_locked_documents_rels" USING btree ("phones_id");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  DROP TABLE IF EXISTS "phones_colours" CASCADE;
  DROP TABLE IF EXISTS "phones_variants" CASCADE;
  DROP TABLE IF EXISTS "phones_price_history" CASCADE;
  DROP TABLE IF EXISTS "phones" CASCADE;
  DROP TABLE IF EXISTS "phone_brands" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "phone_brands_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "phones_id";
  DROP TYPE IF EXISTS "public"."enum_phones_status";
  DROP TYPE IF EXISTS "public"."enum_phones_pta_status";`)
}
