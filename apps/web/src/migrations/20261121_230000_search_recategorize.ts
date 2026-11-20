import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/** The category rules changed (eyewear before electronics): classify every listing again. The sync does it 4,000 rows per call. */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`UPDATE "store_offers" SET "cat" = NULL;`)
}

export async function down(_: MigrateDownArgs): Promise<void> {}
