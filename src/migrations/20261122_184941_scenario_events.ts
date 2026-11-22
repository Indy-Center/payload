import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * A scenario holds ordered events, each tagged with a difficulty, in place of a difficulty of its
 * own (decision 0070). Existing scenarios keep everything else and get no events; their
 * difficulties are dropped, not carried.
 */
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_scenarios_events_difficulty" AS ENUM('easy', 'medium', 'hard');
  CREATE TABLE "scenarios_events" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"difficulty" "enum_scenarios_events_difficulty" DEFAULT 'easy' NOT NULL,
  	"callsign" varchar,
  	"aircraft_type" varchar,
  	"description" varchar NOT NULL
  );
  
  ALTER TABLE "scenarios_events" ADD CONSTRAINT "scenarios_events_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."scenarios"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "scenarios_events_order_idx" ON "scenarios_events" USING btree ("_order");
  CREATE INDEX "scenarios_events_parent_id_idx" ON "scenarios_events" USING btree ("_parent_id");
  ALTER TABLE "scenarios" DROP COLUMN "difficulty";
  DROP TYPE "public"."enum_scenarios_difficulty";`)
}

/** The difficulty column comes back empty; the events are lost. */
export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_scenarios_difficulty" AS ENUM('easy', 'medium', 'hard');
  DROP TABLE "scenarios_events" CASCADE;
  ALTER TABLE "scenarios" ADD COLUMN "difficulty" "enum_scenarios_difficulty";
  DROP TYPE "public"."enum_scenarios_events_difficulty";`)
}
