import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * A scenario gets a teacher-only description and an ATCTrainer link, and loses its sim-or-live
 * mode: it is always a sim setup now (decision 0065). The mode's values are discarded.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "scenarios" ADD COLUMN "description" varchar;
  ALTER TABLE "scenarios" ADD COLUMN "atctrainer" varchar;
  ALTER TABLE "scenarios" DROP COLUMN "mode";
  DROP TYPE "public"."enum_scenarios_mode";`)
}

/** Every scenario comes back as a sim; the description and link are lost. */
export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_scenarios_mode" AS ENUM('sim', 'live');
  ALTER TABLE "scenarios" ADD COLUMN "mode" "enum_scenarios_mode" DEFAULT 'sim' NOT NULL;
  ALTER TABLE "scenarios" DROP COLUMN "description";
  ALTER TABLE "scenarios" DROP COLUMN "atctrainer";`)
}
