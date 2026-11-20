import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/** Crawl frontier for product search (docs/PRODUCT-SEARCH.md sections 9 and 11): stores are discovered, probed and crawled automatically. Additive only. */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  CREATE TABLE IF NOT EXISTS "search_hosts" (
    "host" varchar PRIMARY KEY,
    "slug" varchar NOT NULL,
    "name" varchar NOT NULL,
    "base_url" varchar NOT NULL,
    "platform" varchar,
    "state" varchar NOT NULL DEFAULT 'candidate',
    "source" varchar,
    "listings" integer NOT NULL DEFAULT 0,
    "crawl_page" integer NOT NULL DEFAULT 1,
    "found_at" timestamp(3) with time zone NOT NULL DEFAULT now(),
    "last_probe_at" timestamp(3) with time zone,
    "last_crawl_at" timestamp(3) with time zone,
    "next_crawl_at" timestamp(3) with time zone,
    "fail_count" integer NOT NULL DEFAULT 0,
    "last_error" varchar
  );
  CREATE UNIQUE INDEX IF NOT EXISTS "search_hosts_slug_idx" ON "search_hosts" USING btree ("slug");
  CREATE INDEX IF NOT EXISTS "search_hosts_state_idx" ON "search_hosts" USING btree ("state", "next_crawl_at");
  CREATE TABLE IF NOT EXISTS "search_label_map" (
    "store" varchar NOT NULL,
    "label" varchar NOT NULL,
    "category" varchar,
    "by" varchar NOT NULL DEFAULT 'rule',
    "products" integer NOT NULL DEFAULT 0,
    "first_seen_at" timestamp(3) with time zone NOT NULL DEFAULT now(),
    PRIMARY KEY ("store", "label")
  );
  CREATE TABLE IF NOT EXISTS "search_discovery_log" (
    "id" bigserial PRIMARY KEY,
    "at" timestamp(3) with time zone NOT NULL DEFAULT now(),
    "stats" jsonb NOT NULL
  );
  INSERT INTO "search_hosts" ("host","slug","name","base_url","platform","state","source","next_crawl_at") VALUES
    ('www.telemart.pk','telemart','Telemart','https://www.telemart.pk','shopify','active','seed',now()),
    ('mistore.pk','mistore','Mi Store Pakistan','https://mistore.pk','shopify','active','seed',now()),
    ('www.friendshome.pk','friendshome','Friends Home','https://www.friendshome.pk','shopify','active','seed',now())
  ON CONFLICT DO NOTHING;`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`DROP TABLE IF EXISTS "search_discovery_log", "search_label_map", "search_hosts";`)
}
