import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/** Product search (21 Nov 2026, docs/PRODUCT-SEARCH.md): additive columns and tables only, safe while the old release runs. */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "store_offers" ADD COLUMN IF NOT EXISTS "product_key" varchar;
  ALTER TABLE "store_offers" ADD COLUMN IF NOT EXISTS "gtin" varchar;
  ALTER TABLE "store_offers" ADD COLUMN IF NOT EXISTS "category_path" varchar;
  ALTER TABLE "store_offers" ADD COLUMN IF NOT EXISTS "first_seen_at" timestamp(3) with time zone;
  ALTER TABLE "store_offers" ADD COLUMN IF NOT EXISTS "search_synced_at" timestamp(3) with time zone;
  CREATE INDEX IF NOT EXISTS "store_offers_product_key_idx" ON "store_offers" USING btree ("product_key");
  CREATE INDEX IF NOT EXISTS "store_offers_search_synced_at_idx" ON "store_offers" USING btree ("search_synced_at");
  CREATE TABLE IF NOT EXISTS "offer_price_history" (
    "id" bigserial PRIMARY KEY,
    "offer_slug" varchar NOT NULL,
    "price_pkr" numeric,
    "list_price_pkr" numeric,
    "in_stock" boolean,
    "at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  CREATE INDEX IF NOT EXISTS "offer_price_history_slug_at_idx" ON "offer_price_history" USING btree ("offer_slug", "at");
  CREATE TABLE IF NOT EXISTS "search_crawl_runs" (
    "id" bigserial PRIMARY KEY,
    "store" varchar NOT NULL,
    "at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "page" integer,
    "listings" integer DEFAULT 0,
    "changed" integer DEFAULT 0,
    "ok" boolean DEFAULT true,
    "error" varchar
  );
  CREATE INDEX IF NOT EXISTS "search_crawl_runs_store_at_idx" ON "search_crawl_runs" USING btree ("store", "at");
  CREATE TABLE IF NOT EXISTS "search_sync_state" (
    "id" integer PRIMARY KEY,
    "last_sync_at" timestamp(3) with time zone,
    "last_sync_docs" integer DEFAULT 0,
    "last_reindex_at" timestamp(3) with time zone,
    "last_error" varchar,
    "index_docs" integer,
    "index_docs_yesterday" integer,
    "yesterday_at" timestamp(3) with time zone
  );
  INSERT INTO "search_sync_state" ("id") VALUES (1) ON CONFLICT DO NOTHING;`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  DROP TABLE IF EXISTS "search_sync_state", "search_crawl_runs", "offer_price_history";
  ALTER TABLE "store_offers" DROP COLUMN IF EXISTS "product_key", DROP COLUMN IF EXISTS "gtin", DROP COLUMN IF EXISTS "category_path", DROP COLUMN IF EXISTS "first_seen_at", DROP COLUMN IF EXISTS "search_synced_at";`)
}
