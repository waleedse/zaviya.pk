// Additive only (new tables, enums and a nullable column on payload_locked_documents_rels): the old release keeps working while this one deploys.
import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_appliances_brand" AS ENUM('samsung', 'nasgas', 'anex', 'westpoint');
  CREATE TYPE "public"."enum_appliances_category" AS ENUM('air-conditioners', 'refrigerators', 'washing-machines', 'water-heaters', 'room-heaters', 'air-coolers', 'water-dispensers', 'microwave-ovens', 'cooking-ranges', 'kitchen-hoods', 'dishwashers', 'air-fryers', 'blenders', 'kettles', 'irons', 'fans', 'cookers', 'toasters-sandwich-makers');
  CREATE TABLE "appliances_specs" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"label" varchar NOT NULL,
  	"value" varchar NOT NULL
  );
  
  CREATE TABLE "appliances_price_history" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"date" timestamp(3) with time zone NOT NULL,
  	"price_pkr" numeric NOT NULL,
  	"source_url" varchar
  );
  
  CREATE TABLE "appliances" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"slug" varchar NOT NULL,
  	"brand" "enum_appliances_brand" NOT NULL,
  	"category" "enum_appliances_category" NOT NULL,
  	"model" varchar,
  	"hidden" boolean DEFAULT false,
  	"popularity" numeric DEFAULT 0,
  	"image_url" varchar,
  	"official_url" varchar NOT NULL,
  	"summary" varchar,
  	"price_pkr" numeric,
  	"list_price_pkr" numeric,
  	"in_stock" boolean,
  	"price_updated_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "appliances_id" integer;
  ALTER TABLE "appliances_specs" ADD CONSTRAINT "appliances_specs_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."appliances"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "appliances_price_history" ADD CONSTRAINT "appliances_price_history_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."appliances"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "appliances_specs_order_idx" ON "appliances_specs" USING btree ("_order");
  CREATE INDEX "appliances_specs_parent_id_idx" ON "appliances_specs" USING btree ("_parent_id");
  CREATE INDEX "appliances_price_history_order_idx" ON "appliances_price_history" USING btree ("_order");
  CREATE INDEX "appliances_price_history_parent_id_idx" ON "appliances_price_history" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "appliances_slug_idx" ON "appliances" USING btree ("slug");
  CREATE INDEX "appliances_brand_idx" ON "appliances" USING btree ("brand");
  CREATE INDEX "appliances_category_idx" ON "appliances" USING btree ("category");
  CREATE INDEX "appliances_popularity_idx" ON "appliances" USING btree ("popularity");
  CREATE INDEX "appliances_price_pkr_idx" ON "appliances" USING btree ("price_pkr");
  CREATE INDEX "appliances_updated_at_idx" ON "appliances" USING btree ("updated_at");
  CREATE INDEX "appliances_created_at_idx" ON "appliances" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_appliances_fk" FOREIGN KEY ("appliances_id") REFERENCES "public"."appliances"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_appliances_id_idx" ON "payload_locked_documents_rels" USING btree ("appliances_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "appliances_specs" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "appliances_price_history" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "appliances" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "appliances_specs" CASCADE;
  DROP TABLE "appliances_price_history" CASCADE;
  DROP TABLE "appliances" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_appliances_fk";
  
  DROP INDEX "payload_locked_documents_rels_appliances_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "appliances_id";
  DROP TYPE "public"."enum_appliances_brand";
  DROP TYPE "public"."enum_appliances_category";`)
}
