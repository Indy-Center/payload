import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Indy's temporary short names (decision 0060). `short_name` becomes the short name served, and
 * vNAS's own moves to `vnas_short_name`. Until now every short name was vNAS's, so it is copied
 * across and the one served is unchanged; the next sync fills in the generated ones.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "positions" ADD COLUMN "vnas_short_name" varchar;
  ALTER TABLE "positions" ADD COLUMN "indy_short_name_generated" varchar;
  ALTER TABLE "positions" ADD COLUMN "indy_short_name_override" varchar;
  UPDATE "positions" SET "vnas_short_name" = "short_name";`)
}

/** Back to vNAS's short names alone: Indy's generated ones and overrides are dropped. */
export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   UPDATE "positions" SET "short_name" = "vnas_short_name",
    "title" = coalesce("vnas_short_name", "callsign") || ' · ' || "name";
  ALTER TABLE "positions" DROP COLUMN "vnas_short_name";
  ALTER TABLE "positions" DROP COLUMN "indy_short_name_generated";
  ALTER TABLE "positions" DROP COLUMN "indy_short_name_override";`)
}
