// Additive only (new tables, enums and nullable columns on payload_locked_documents_rels): the old release keeps working while this one deploys.
import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_result_boards_region" AS ENUM('federal', 'punjab', 'sindh', 'kp', 'balochistan', 'ajk');
  CREATE TYPE "public"."enum_result_exams_class_level" AS ENUM('9', '10', '11', '12');
  CREATE TYPE "public"."enum_result_exams_session" AS ENUM('annual', 'supplementary');
  CREATE TYPE "public"."enum_result_exams_status" AS ENUM('not_announced', 'expected', 'announced');
  CREATE TYPE "public"."enum_vacation_notices_region" AS ENUM('punjab', 'sindh', 'kp', 'balochistan', 'islamabad');
  CREATE TYPE "public"."enum_vacation_notices_status" AS ENUM('not_announced', 'reported', 'notified');
  CREATE TYPE "public"."enum_school_closures_region" AS ENUM('punjab', 'sindh', 'kp', 'balochistan', 'islamabad');
  CREATE TYPE "public"."enum_school_closures_reason" AS ENUM('smog', 'rain', 'weather', 'security', 'other');
  CREATE TYPE "public"."enum_school_closures_status" AS ENUM('announced', 'extended', 'cancelled');
  CREATE TABLE "result_boards_faqs" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"q" varchar NOT NULL,
  	"a" varchar NOT NULL
  );
  
  CREATE TABLE "result_boards" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"slug" varchar NOT NULL,
  	"region" "enum_result_boards_region" NOT NULL,
  	"city" varchar,
  	"official_site" varchar,
  	"result_url" varchar,
  	"sms_code" varchar,
  	"sms_how_to" varchar,
  	"gazette_url" varchar,
  	"notes" varchar,
  	"checked_at" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "result_exams" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"label" varchar,
  	"board_id" integer NOT NULL,
  	"class_level" "enum_result_exams_class_level" NOT NULL,
  	"session" "enum_result_exams_session" DEFAULT 'annual' NOT NULL,
  	"year" numeric NOT NULL,
  	"status" "enum_result_exams_status" DEFAULT 'not_announced' NOT NULL,
  	"expected_date" varchar,
  	"announced_date" varchar,
  	"source_url" varchar,
  	"source_note" varchar,
  	"result_link" varchar,
  	"gazette_url" varchar,
  	"position_holders" varchar,
  	"pass_percentage" varchar,
  	"notes" varchar,
  	"checked_at" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "vacation_notices" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"region" "enum_vacation_notices_region" NOT NULL,
  	"status" "enum_vacation_notices_status" DEFAULT 'not_announced' NOT NULL,
  	"start_date" varchar,
  	"end_date" varchar,
  	"source_url" varchar,
  	"source_note" varchar,
  	"source_date" varchar,
  	"last_year_start_date" varchar,
  	"last_year_end_date" varchar,
  	"last_year_note" varchar,
  	"last_year_source_url" varchar,
  	"notes" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "school_closures" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"region" "enum_school_closures_region" NOT NULL,
  	"scope" varchar NOT NULL,
  	"date" varchar NOT NULL,
  	"end_date" varchar,
  	"reason" "enum_school_closures_reason" DEFAULT 'smog' NOT NULL,
  	"status" "enum_school_closures_status" DEFAULT 'announced' NOT NULL,
  	"source_url" varchar,
  	"source_note" varchar,
  	"notes" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "result_boards_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "result_exams_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "vacation_notices_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "school_closures_id" integer;
  ALTER TABLE "result_boards_faqs" ADD CONSTRAINT "result_boards_faqs_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."result_boards"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "result_exams" ADD CONSTRAINT "result_exams_board_id_result_boards_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."result_boards"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "result_boards_faqs_order_idx" ON "result_boards_faqs" USING btree ("_order");
  CREATE INDEX "result_boards_faqs_parent_id_idx" ON "result_boards_faqs" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "result_boards_slug_idx" ON "result_boards" USING btree ("slug");
  CREATE INDEX "result_boards_updated_at_idx" ON "result_boards" USING btree ("updated_at");
  CREATE INDEX "result_boards_created_at_idx" ON "result_boards" USING btree ("created_at");
  CREATE INDEX "result_exams_board_idx" ON "result_exams" USING btree ("board_id");
  CREATE INDEX "result_exams_updated_at_idx" ON "result_exams" USING btree ("updated_at");
  CREATE INDEX "result_exams_created_at_idx" ON "result_exams" USING btree ("created_at");
  CREATE UNIQUE INDEX "vacation_notices_region_idx" ON "vacation_notices" USING btree ("region");
  CREATE INDEX "vacation_notices_updated_at_idx" ON "vacation_notices" USING btree ("updated_at");
  CREATE INDEX "vacation_notices_created_at_idx" ON "vacation_notices" USING btree ("created_at");
  CREATE INDEX "school_closures_updated_at_idx" ON "school_closures" USING btree ("updated_at");
  CREATE INDEX "school_closures_created_at_idx" ON "school_closures" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_result_boards_fk" FOREIGN KEY ("result_boards_id") REFERENCES "public"."result_boards"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_result_exams_fk" FOREIGN KEY ("result_exams_id") REFERENCES "public"."result_exams"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_vacation_notices_fk" FOREIGN KEY ("vacation_notices_id") REFERENCES "public"."vacation_notices"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_school_closures_fk" FOREIGN KEY ("school_closures_id") REFERENCES "public"."school_closures"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_result_boards_id_idx" ON "payload_locked_documents_rels" USING btree ("result_boards_id");
  CREATE INDEX "payload_locked_documents_rels_result_exams_id_idx" ON "payload_locked_documents_rels" USING btree ("result_exams_id");
  CREATE INDEX "payload_locked_documents_rels_vacation_notices_id_idx" ON "payload_locked_documents_rels" USING btree ("vacation_notices_id");
  CREATE INDEX "payload_locked_documents_rels_school_closures_id_idx" ON "payload_locked_documents_rels" USING btree ("school_closures_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "result_boards_faqs" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "result_boards" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "result_exams" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "vacation_notices" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "school_closures" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "result_boards_faqs" CASCADE;
  DROP TABLE "result_boards" CASCADE;
  DROP TABLE "result_exams" CASCADE;
  DROP TABLE "vacation_notices" CASCADE;
  DROP TABLE "school_closures" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_result_boards_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_result_exams_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_vacation_notices_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_school_closures_fk";
  
  DROP INDEX "payload_locked_documents_rels_result_boards_id_idx";
  DROP INDEX "payload_locked_documents_rels_result_exams_id_idx";
  DROP INDEX "payload_locked_documents_rels_vacation_notices_id_idx";
  DROP INDEX "payload_locked_documents_rels_school_closures_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "result_boards_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "result_exams_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "vacation_notices_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "school_closures_id";
  DROP TYPE "public"."enum_result_boards_region";
  DROP TYPE "public"."enum_result_exams_class_level";
  DROP TYPE "public"."enum_result_exams_session";
  DROP TYPE "public"."enum_result_exams_status";
  DROP TYPE "public"."enum_vacation_notices_region";
  DROP TYPE "public"."enum_vacation_notices_status";
  DROP TYPE "public"."enum_school_closures_region";
  DROP TYPE "public"."enum_school_closures_reason";
  DROP TYPE "public"."enum_school_closures_status";`)
}
