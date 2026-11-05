import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "appliances_city_prices" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"city" varchar NOT NULL,
  	"min" numeric,
  	"avg" numeric NOT NULL,
  	"max" numeric
  );
  
  CREATE TABLE "price_demand" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"query" varchar NOT NULL,
  	"category" varchar,
  	"priority" numeric DEFAULT 50 NOT NULL,
  	"origin" varchar DEFAULT 'research',
  	"source_hint" varchar,
  	"note" varchar,
  	"matched" numeric DEFAULT 0,
  	"matched_slugs" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "appliances" ALTER COLUMN "brand" SET DATA TYPE varchar;
  ALTER TABLE "appliances" ALTER COLUMN "category" SET DATA TYPE varchar;
  ALTER TABLE "appliances" ADD COLUMN "name_ur" varchar;
  ALTER TABLE "appliances" ADD COLUMN "unit" varchar;
  ALTER TABLE "appliances" ADD COLUMN "hot_score" numeric DEFAULT 0;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "price_demand_id" integer;
  ALTER TABLE "appliances_city_prices" ADD CONSTRAINT "appliances_city_prices_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."appliances"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "appliances_city_prices_order_idx" ON "appliances_city_prices" USING btree ("_order");
  CREATE INDEX "appliances_city_prices_parent_id_idx" ON "appliances_city_prices" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "price_demand_query_idx" ON "price_demand" USING btree ("query");
  CREATE INDEX "price_demand_priority_idx" ON "price_demand" USING btree ("priority");
  CREATE INDEX "price_demand_updated_at_idx" ON "price_demand" USING btree ("updated_at");
  CREATE INDEX "price_demand_created_at_idx" ON "price_demand" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_price_demand_fk" FOREIGN KEY ("price_demand_id") REFERENCES "public"."price_demand"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "appliances_hot_score_idx" ON "appliances" USING btree ("hot_score");
  CREATE INDEX "payload_locked_documents_rels_price_demand_id_idx" ON "payload_locked_documents_rels" USING btree ("price_demand_id");
  DROP TYPE "public"."enum_appliances_brand";
  DROP TYPE "public"."enum_appliances_category";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_appliances_brand" AS ENUM('samsung', 'nasgas', 'anex', 'westpoint');
  CREATE TYPE "public"."enum_appliances_category" AS ENUM('air-conditioners', 'refrigerators', 'washing-machines', 'water-heaters', 'room-heaters', 'air-coolers', 'water-dispensers', 'microwave-ovens', 'cooking-ranges', 'kitchen-hoods', 'dishwashers', 'air-fryers', 'blenders', 'kettles', 'irons', 'fans', 'cookers', 'toasters-sandwich-makers');
  ALTER TABLE "appliances_city_prices" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "price_demand" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "appliances_city_prices" CASCADE;
  DROP TABLE "price_demand" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_price_demand_fk";
  
  DROP INDEX "appliances_hot_score_idx";
  DROP INDEX "payload_locked_documents_rels_price_demand_id_idx";
  ALTER TABLE "appliances" ALTER COLUMN "brand" SET DATA TYPE "public"."enum_appliances_brand" USING "brand"::"public"."enum_appliances_brand";
  ALTER TABLE "appliances" ALTER COLUMN "category" SET DATA TYPE "public"."enum_appliances_category" USING "category"::"public"."enum_appliances_category";
  ALTER TABLE "appliances" DROP COLUMN "name_ur";
  ALTER TABLE "appliances" DROP COLUMN "unit";
  ALTER TABLE "appliances" DROP COLUMN "hot_score";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "price_demand_id";`)
}
