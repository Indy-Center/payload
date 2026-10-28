import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * A citation's "section" becomes its "place", and it gains an optional "title". The column is
 * renamed, not dropped and added, so every existing value moves across unchanged. Written by
 * hand: `migrate:create` asks about the rename interactively, and the rename keeps the data.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "tasks_citations" RENAME COLUMN "section" TO "place";
  ALTER TABLE "tasks_citations" ADD COLUMN "title" varchar;`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "tasks_citations" DROP COLUMN "title";
  ALTER TABLE "tasks_citations" RENAME COLUMN "place" TO "section";`)
}
