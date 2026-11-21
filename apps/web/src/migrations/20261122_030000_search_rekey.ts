import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/** Product keys now also merge identical titles across stores: compute every key again and re-send everything to the index. */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`UPDATE "store_offers" SET "search_synced_at" = NULL;`)
}

export async function down(_: MigrateDownArgs): Promise<void> {}
