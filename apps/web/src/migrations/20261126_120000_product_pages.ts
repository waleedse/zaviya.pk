import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Product pages redesign (26 Nov): store pictures, description and specs per listing; one table for the category tree (every level, with its
 * picture, product count and lowest price, refreshed by the search sync); one table for the AI notes on product pages. Additive only.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "store_offers" ADD COLUMN IF NOT EXISTS "images" jsonb;
  ALTER TABLE "store_offers" ADD COLUMN IF NOT EXISTS "description" text;
  ALTER TABLE "store_offers" ADD COLUMN IF NOT EXISTS "specs" jsonb;
  CREATE TABLE IF NOT EXISTS "product_categories" (
    "path" varchar PRIMARY KEY,
    "url_path" varchar NOT NULL UNIQUE,
    "name" varchar NOT NULL,
    "parent" varchar,
    "level" integer NOT NULL,
    "products" integer NOT NULL DEFAULT 0,
    "min_price" numeric,
    "image_url" varchar,
    "image_product_id" varchar,
    "updated_at" timestamp(3) with time zone NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS "product_categories_parent_idx" ON "product_categories" USING btree ("parent");
  CREATE TABLE IF NOT EXISTS "product_ai_notes" (
    "product_id" varchar PRIMARY KEY,
    "note" text NOT NULL,
    "model" varchar,
    "created_at" timestamp(3) with time zone NOT NULL DEFAULT now()
  );`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`DROP TABLE IF EXISTS "product_ai_notes"; DROP TABLE IF EXISTS "product_categories";
  ALTER TABLE "store_offers" DROP COLUMN IF EXISTS "specs"; ALTER TABLE "store_offers" DROP COLUMN IF EXISTS "description"; ALTER TABLE "store_offers" DROP COLUMN IF EXISTS "images";`)
}
