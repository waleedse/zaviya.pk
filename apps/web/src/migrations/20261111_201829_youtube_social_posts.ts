import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "public"."enum_social_posts_platform" ADD VALUE 'youtube';
  ALTER TYPE "public"."enum_social_posts_format" ADD VALUE 'short';
  ALTER TYPE "public"."enum_social_posts_format" ADD VALUE 'video';`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "social_posts" ALTER COLUMN "platform" SET DATA TYPE text;
  DROP TYPE "public"."enum_social_posts_platform";
  CREATE TYPE "public"."enum_social_posts_platform" AS ENUM('facebook', 'instagram', 'x', 'whatsapp');
  ALTER TABLE "social_posts" ALTER COLUMN "platform" SET DATA TYPE "public"."enum_social_posts_platform" USING "platform"::"public"."enum_social_posts_platform";
  ALTER TABLE "social_posts" ALTER COLUMN "format" SET DATA TYPE text;
  DROP TYPE "public"."enum_social_posts_format";
  CREATE TYPE "public"."enum_social_posts_format" AS ENUM('link', 'card', 'carousel', 'reel', 'text');
  ALTER TABLE "social_posts" ALTER COLUMN "format" SET DATA TYPE "public"."enum_social_posts_format" USING "format"::"public"."enum_social_posts_format";`)
}
