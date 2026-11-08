import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "lesson_plans_resources" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"title" varchar NOT NULL,
  	"url" varchar NOT NULL,
  	"teacher_only" boolean DEFAULT false
  );
  
  ALTER TABLE "lesson_plans_resources" ADD CONSTRAINT "lesson_plans_resources_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."lesson_plans"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "lesson_plans_resources_order_idx" ON "lesson_plans_resources" USING btree ("_order");
  CREATE INDEX "lesson_plans_resources_parent_id_idx" ON "lesson_plans_resources" USING btree ("_parent_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "lesson_plans_resources" CASCADE;`)
}
