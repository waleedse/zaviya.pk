import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/** Category path per listing (docs/PRODUCT-SEARCH.md section 11): NULL = not yet classified, 'Other' = no rule placed it. Additive only. */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "store_offers" ADD COLUMN IF NOT EXISTS "cat" varchar;
  CREATE INDEX IF NOT EXISTS "store_offers_cat_idx" ON "store_offers" USING btree ("cat");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`ALTER TABLE "store_offers" DROP COLUMN IF EXISTS "cat";`)
}
