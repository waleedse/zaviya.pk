import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/** Store offers (15 Nov 2026): one new table, additive only, safe while the old release still runs. */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  CREATE TABLE IF NOT EXISTS "store_offers" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"slug" varchar NOT NULL,
  	"store" varchar NOT NULL,
  	"title" varchar NOT NULL,
  	"brand" varchar,
  	"group" varchar NOT NULL,
  	"url" varchar NOT NULL,
  	"image_url" varchar,
  	"price_pkr" numeric,
  	"list_price_pkr" numeric,
  	"prev_price_pkr" numeric,
  	"price_changed_at" timestamp(3) with time zone,
  	"in_stock" boolean,
  	"model" varchar,
  	"match_kind" varchar,
  	"match_slug" varchar,
  	"seen_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "store_offers_id" integer;
  CREATE UNIQUE INDEX IF NOT EXISTS "store_offers_slug_idx" ON "store_offers" USING btree ("slug");
  CREATE INDEX IF NOT EXISTS "store_offers_store_idx" ON "store_offers" USING btree ("store");
  CREATE INDEX IF NOT EXISTS "store_offers_brand_idx" ON "store_offers" USING btree ("brand");
  CREATE INDEX IF NOT EXISTS "store_offers_group_idx" ON "store_offers" USING btree ("group");
  CREATE INDEX IF NOT EXISTS "store_offers_price_pkr_idx" ON "store_offers" USING btree ("price_pkr");
  CREATE INDEX IF NOT EXISTS "store_offers_price_changed_at_idx" ON "store_offers" USING btree ("price_changed_at");
  CREATE INDEX IF NOT EXISTS "store_offers_match_kind_idx" ON "store_offers" USING btree ("match_kind");
  CREATE INDEX IF NOT EXISTS "store_offers_match_slug_idx" ON "store_offers" USING btree ("match_slug");
  CREATE INDEX IF NOT EXISTS "store_offers_seen_at_idx" ON "store_offers" USING btree ("seen_at");
  CREATE INDEX IF NOT EXISTS "store_offers_updated_at_idx" ON "store_offers" USING btree ("updated_at");
  CREATE INDEX IF NOT EXISTS "store_offers_created_at_idx" ON "store_offers" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_store_offers_fk" FOREIGN KEY ("store_offers_id") REFERENCES "public"."store_offers"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_store_offers_id_idx" ON "payload_locked_documents_rels" USING btree ("store_offers_id");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_store_offers_fk";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_store_offers_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "store_offers_id";
  DROP TABLE IF EXISTS "store_offers" CASCADE;`)
}
