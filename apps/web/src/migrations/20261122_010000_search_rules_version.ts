import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/** Rules version of the category tree: a new version makes the sync classify everything again. Additive only. */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`ALTER TABLE "search_sync_state" ADD COLUMN IF NOT EXISTS "rules_version" integer NOT NULL DEFAULT 1;`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`ALTER TABLE "search_sync_state" DROP COLUMN IF EXISTS "rules_version";`)
}
