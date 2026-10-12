import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "public"."enum_categories_slug" ADD VALUE IF NOT EXISTS 'ai' BEFORE 'autos';`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "categories" ALTER COLUMN "slug" SET DATA TYPE text;
  DROP TYPE "public"."enum_categories_slug";
  CREATE TYPE "public"."enum_categories_slug" AS ENUM('pakistan', 'world', 'business', 'tech-telecom', 'autos', 'cricket', 'education-jobs', 'trending');
  ALTER TABLE "categories" ALTER COLUMN "slug" SET DATA TYPE "public"."enum_categories_slug" USING "slug"::"public"."enum_categories_slug";`)
}
